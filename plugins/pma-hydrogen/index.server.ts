import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { defineAgentTool } from "@getpaseo/plugin/server";
import type { AgentToolContext, PluginServerContext } from "@getpaseo/plugin/server";
import { z } from "zod";
import {
  answerPermission, idSchema, permissionKind, requestSchema, resultKind, restore, statusKind,
} from "./shared/hydrogen";
import { readDeliveries, readDelivery, rootDirectory, writeDelivery } from "./server/storage";
import type { Delivery } from "./server/storage";

type Paseo = AgentToolContext["paseo"];
type Agent = ReturnType<Paseo["agents"]["ref"]>;
type Permission = NonNullable<Agent["pendingPermissions"]>[number];

const provider = "antigravity";
const model = "gemini-4-hydrogen";
const rootKey = "pma-hydrogen.root";
const workerKey = "pma-hydrogen.worker";
const deliveryKey = "pma-hydrogen.delivery";
const active = new Set<string>();
const displayed = new Set<string>();
const finishing = new Map<string, Promise<Delivery | null>>();

function resultRows(text: string) {
  if (Buffer.byteLength(JSON.stringify({ text }), "utf8") <= 64 * 1024) return [text];

  // JSON escaping costs at most six bytes per UTF-16 code unit.
  const rows: string[] = [];
  let row = "";
  for (const character of text) {
    if (row.length + character.length > 10_000) {
      rows.push(row);
      row = "";
    }
    row += character;
  }
  if (row) rows.push(row);
  return rows;
}

async function display(root: Agent, requestId: string, text: string) {
  const rows = resultRows(text);
  for (const [index, row] of rows.entries()) {
    await root.timeline.append({
      type: "plugin",
      id: requestId + "-" + index,
      kind: resultKind,
      version: 1,
      data: { text: row },
    });
  }
  displayed.add(root.id + "/" + requestId);
}

async function restoreFor(paseo: Paseo, agentId: string, force = false) {
  const root = paseo.agents.ref(agentId);
  const deliveries = await readDeliveries(agentId);
  if (force && deliveries.length) {
    // A conversation may be unopened after a daemon restart.
    const history = await root.timeline.refetch({ direction: "tail", limit: 1 });
    if (history.error || history.agent?.provider !== "codex" || history.agent.archivedAt) {
      throw new Error("无法打开此主对话以恢复成稿。");
    }
  }

  const latestByWorker = new Map(deliveries.flatMap(({ requestId, record }) =>
    record ? [[record.workerId, requestId] as const] : [],
  ));
  let count = 0;
  for (const { requestId, record } of deliveries) {
    if (!record || (!force && displayed.has(agentId + "/" + requestId))) continue;
    if (record.text || record.failed) {
      await displayDelivery(root, requestId, record);
      count++;
    } else if (!active.has(agentId) && latestByWorker.get(record.workerId) === requestId) {
      const worker = paseo.agents.ref(record.workerId);
      const snapshot = (await worker.refresh())?.agent;
      if (!ownsWorker(root, snapshot)) continue;
      const boundDelivery = snapshot?.metadata?.[deliveryKey];
      if (boundDelivery && boundDelivery !== requestId) continue;
      if (worker.pendingPermissions?.length) {
        if (!boundDelivery) await worker.setMetadata({ [deliveryKey]: requestId });
        for (const request of worker.pendingPermissions) await showPermission(root, requestId, request);
      } else if (worker.status !== "running") {
        const settled = await finishDelivery(root, requestId, worker, worker.status !== "error");
        if (settled?.text || settled?.draft) count++;
      }
    }
  }
  return { count };
}

async function resolveRoot({ agent, paseo }: AgentToolContext, target?: string) {
  const rootId = target ?? agent.id;
  if (agent.parentAgentId !== null &&
      (target !== agent.parentAgentId || agent.provider !== "codex")) {
    throw new Error("请指定直接父会话的 Paseo ID 作为回显目标。");
  }
  if (agent.parentAgentId === null && rootId !== agent.id) {
    throw new Error("顶层会话只能向自身交付。");
  }

  const root = paseo.agents.ref(rootId);
  const rootSnapshot = (await root.refresh())?.agent;
  if (!rootSnapshot || rootSnapshot.provider !== "codex" || root.archivedAt) {
    throw new Error("回显目标需要是可用的 Codex 会话。");
  }
  if (rootId !== agent.id) {
    const caller = await paseo.agents.ref(agent.id).refresh();
    if (caller?.agent.model !== "gpt-6.2-astra") {
      throw new Error("跨会话交付只对原主对话的 Astra 工作者开放。");
    }
  }
  return root;
}

async function getWorker(paseo: Paseo, root: Agent, reuse: boolean) {
  const previousId = idSchema.safeParse(root.metadata?.[workerKey]);
  if (previousId.success) {
    const previous = paseo.agents.ref(previousId.data);
    const snapshot = (await previous.refresh())?.agent;
    if (snapshot?.metadata?.[rootKey] === root.id && !snapshot.archivedAt) {
      if (snapshot.status === "running" || snapshot.pendingPermissions.length) {
        throw new Error("该主会话已有 Hydrogen 工作正在进行。");
      }
      if (reuse && ownsWorker(root, snapshot) && snapshot.status === "idle" &&
          snapshot.currentModeId === "default" && snapshot.options?.auto_accept === false) {
        return previous;
      }
    }
  }

  const cwd = path.join(rootDirectory, "workers", root.id);
  await mkdir(cwd, { recursive: true, mode: 0o700 });
  const worker = await paseo.agents.create({
    cwd,
    parent: root,
    background: true,
    config: { provider: provider + "/" + model, modeId: "default", options: { auto_accept: false } },
    title: "PMA Hydrogen",
    metadata: { [rootKey]: root.id },
  });
  await root.setMetadata({ [workerKey]: worker.id });
  return worker;
}

async function collect(worker: Agent, messageId: string, turnId?: string | null) {
  const history = await worker.timeline.refetch({ direction: "tail", limit: 1, wholeTurns: true });
  if (history.error) throw new Error("暂时无法读取 Hydrogen 本轮结果。");
  const latest = history.entries.findLastIndex(({ item }) => item.type === "user_message");
  const entry = history.entries[latest];
  const prompt = entry?.item;
  if ((turnId && entry?.turnId && entry.turnId !== turnId) || prompt?.type !== "user_message" ||
      (prompt.clientMessageId !== messageId && prompt.messageId !== messageId)) {
    return null;
  }
  const pieces = history.entries.slice(latest + 1).flatMap(({ item }) =>
    item.type === "assistant_message" ? [item.text] : [],
  );
  const body = pieces.join("\n\n").trim().replace(/^hydrogen:[ \t]*(?:\r?\n|$)/i, "").trim();
  return { text: body ? "hydrogen:\n" + body : undefined };
}

function ownsWorker(root: Agent, snapshot: ReturnType<Agent["current"]> | undefined) {
  return snapshot?.provider === provider && snapshot.model === model &&
    snapshot.background && !snapshot.archivedAt && snapshot.metadata?.[rootKey] === root.id;
}

async function displayDelivery(root: Agent, requestId: string, record: Delivery) {
  if (record.text) {
    await display(root, requestId, record.text);
    return;
  }
  if (record.failed) {
    const draft = record.draft ? resultRows(record.draft) : [];
    const title = draft.length ? "Hydrogen 未完成，以下为原定稿" : "Hydrogen 未完成本轮交付";
    await root.timeline.append({
      type: "plugin", id: requestId + "-status", kind: statusKind, version: 1,
      data: { title },
    });
    for (const [index, section] of draft.entries()) {
      await root.timeline.append({
        type: "plugin", id: requestId + "-draft-" + index, kind: resultKind, version: 1,
        data: { text: section },
      });
    }
    displayed.add(root.id + "/" + requestId);
  }
}

function finishDelivery(root: Agent, requestId: string, worker: Agent, completed: boolean, turnId?: string | null) {
  const key = root.id + "/" + requestId;
  const pending = finishing.get(key);
  if (pending) return pending;

  const finish = (async () => {
    const record = await readDelivery(root.id, requestId);
    if (!record || record.workerId !== worker.id) return null;
    if (!record.text && !record.failed) {
      const result = completed || turnId ? await collect(worker, record.messageId, turnId) : null;
      if (turnId && !result) return null;
      if (completed && result?.text) {
        record.text = result.text;
        delete record.draft;
      } else {
        record.failed = true;
      }
      await writeDelivery(root.id, requestId, record);
    }
    if (!displayed.has(key)) await displayDelivery(root, requestId, record);
    return record;
  })().finally(() => finishing.delete(key));
  finishing.set(key, finish);
  return finish;
}

function failedReceipt(record: Delivery | null) {
  if (record?.draft) {
    return {
      text: "Hydrogen 未完成，原定稿已显示在主对话。",
      structuredContent: { delivered: false, fallbackDelivered: true },
    };
  }
  return { text: "Hydrogen 未完成，请提供已有结果。", isError: true };
}

function permissionDetail(request: Permission) {
  const detail = request.detail;
  switch (detail?.type) {
    case "shell": return [detail.cwd, detail.command].filter(Boolean).join("\n");
    case "read":
    case "edit":
    case "write": return detail.filePath;
    case "search": return detail.query;
    case "fetch": return detail.url;
    case "plan":
    case "plain_text": return detail.text;
    default: return request.description;
  }
}

function permissionRowId(deliveryId: string, permissionId: string) {
  return deliveryId + "-permission-" + permissionId;
}

async function showPermission(root: Agent, deliveryId: string, request: Permission) {
  await root.timeline.append({
    type: "plugin", id: permissionRowId(deliveryId, request.id), kind: permissionKind, version: 1,
    data: {
      deliveryId,
      permissionId: request.id,
      title: (request.title || request.name).slice(0, 300),
      detail: permissionDetail(request)?.slice(0, 3000) ?? "",
      actions: (request.actions ?? []).map(({ id, label, behavior }) => ({ id, label, behavior })),
    },
  });
}

async function findWorkerDelivery(paseo: Paseo, workerId: string, metadata: Record<string, unknown>) {
  const rootId = idSchema.safeParse(metadata[rootKey]);
  const deliveryId = requestSchema.safeParse(metadata[deliveryKey]);
  if (!rootId.success || !deliveryId.success) return null;
  const record = await readDelivery(rootId.data, deliveryId.data);
  if (!record || record.workerId !== workerId) return null;
  return { root: paseo.agents.ref(rootId.data), deliveryId: deliveryId.data, record };
}

const publishHydrogen = defineAgentTool({
  name: "pma_hydrogen",
  description: "Use the configured official Hydrogen provider for a short reply or final polish, and display the result only in the original Paseo conversation. This tool returns delivery status only.",
  input: z.object({
    requestId: requestSchema.describe("Stable unique ID for this delivery. Retry with exactly the same ID."),
    rootAgentId: idSchema.optional().describe("Original Paseo Codex ID. Omit from the main conversation, required from its Astra subagent."),
    kind: z.enum(["chat", "polish"]),
    brief: z.string().trim().min(1).describe("Only the current request, necessary facts or writing constraints. When supplying fallbackDraft, put the draft there once."),
    fallbackDraft: z.string().trim().min(1).optional().describe("Verified user-facing draft for polishing and fallback display. Do not repeat it in brief."),
    reuseWorker: z.boolean().default(false).describe("Reuse this root's Hydrogen worker only if its earlier context is relevant."),
  }),
  async execute(input, context) {
    const root = await resolveRoot(context, input.rootAgentId);
    const { paseo } = context;
    if (active.has(root.id)) {
      return { text: "此主对话已有一项 Hydrogen 交付正在处理。", isError: true };
    }

    active.add(root.id);
    try {
      let record = await readDelivery(root.id, input.requestId);
      if (!record?.text && !record?.failed) {
        const worker = record ? paseo.agents.ref(record.workerId) : await getWorker(paseo, root, input.reuseWorker);
        if (!record) {
          const messageId = randomUUID();
          record = { workerId: worker.id, messageId, submittedAt: Date.now(), draft: input.fallbackDraft };
          await writeDelivery(root.id, input.requestId, record);
          await worker.setMetadata({ [deliveryKey]: input.requestId });
          const mode = input.kind === "chat"
            ? "根据下面的简短交接直接回复用户。"
            : "只润色下面已核实的定稿。保留结论、数字、公式、引用、不确定性和各模型来源标签。";
          const prompt = mode + "\n根据交接中的事实或定稿作答。查找文件、执行命令及事实核对由其他角色完成。本轮只写正文，第一行单独写 hydrogen:。\n\n" +
            input.brief + (input.fallbackDraft ? "\n\n已核实定稿\n\n" + input.fallbackDraft : "");
          try {
            await worker.send(prompt, { messageId });
          } catch {
            const snapshot = (await worker.refresh())?.agent;
            if (!snapshot || (snapshot.status !== "running" && !snapshot.pendingPermissions.length)) {
              return failedReceipt(await finishDelivery(root, input.requestId, worker, false));
            }
          }
        }

        const outcome = await worker.waitForFinish(180_000);
        if (outcome.status === "permission" || outcome.status === "timeout") {
          for (const permission of worker.pendingPermissions ?? []) {
            await showPermission(root, input.requestId, permission);
          }
          return {
            text: outcome.status === "permission" ? "Hydrogen 正在主对话等待用户处理请求。" : "Hydrogen 仍在处理，会在完成后自动回显。",
            structuredContent: { delivered: false, pending: true, requestId: input.requestId },
          };
        }
        record = await finishDelivery(root, input.requestId, worker, outcome.status === "idle");
      }

      if (record?.failed) {
        if (!displayed.has(root.id + "/" + input.requestId)) await displayDelivery(root, input.requestId, record);
        return failedReceipt(record);
      }
      if (!record?.text) return { text: "Hydrogen 未能交付本轮内容。", isError: true };
      if (!displayed.has(root.id + "/" + input.requestId)) await display(root, input.requestId, record.text);
      return { text: "Hydrogen 成稿已显示在原 Paseo 对话。", structuredContent: { delivered: true, requestId: input.requestId } };
    } finally {
      active.delete(root.id);
    }
  },
});

export default function contribute(server: PluginServerContext) {
  server.addHook("agent.open.before", async ({ request }) => {
    if (request.provider !== "codex" ||
        (request.background && request.labels["paseo-workflow-role"] !== "astra")) return;
    return { ...request, tools: [...request.tools, publishHydrogen] };
  });

  server.addHook("agent.turn.before", async ({ agent }, { paseo }) => {
    if (agent.provider === "codex" && !agent.parentAgentId && !agent.background) {
      await restoreFor(paseo, agent.id);
    }
  });

  server.handle(restore, ({ agentId }, { paseo }) => restoreFor(paseo, agentId, true));

  server.addHook("agent.permission.before", async ({ agent, request }, { paseo }) => {
    if (agent.provider !== provider || !agent.background) return;
    const delivery = await findWorkerDelivery(paseo, agent.id, agent.metadata);
    if (delivery && !delivery.record.text && !delivery.record.failed) {
      await showPermission(delivery.root, delivery.deliveryId, request);
    }
  });

  server.addHook("agent.permission.after", async ({ agent, requestId, resolution }, { paseo }) => {
    if (agent.provider !== provider || !agent.background) return;
    const delivery = await findWorkerDelivery(paseo, agent.id, agent.metadata);
    if (!delivery) return;
    await delivery.root.timeline.append({
      type: "plugin", id: permissionRowId(delivery.deliveryId, requestId), kind: statusKind, version: 1,
      data: { title: resolution.behavior === "allow" ? "Hydrogen 请求已允许" : "Hydrogen 请求已拒绝" },
    });
  });

  server.addHook("agent.turn.after", async ({ agent, turnId, outcome }, { paseo }) => {
    if (agent.provider !== provider || !agent.background) return;
    const delivery = await findWorkerDelivery(paseo, agent.id, agent.metadata);
    if (delivery && !delivery.record.text && !delivery.record.failed) {
      await finishDelivery(delivery.root, delivery.deliveryId, paseo.agents.ref(agent.id), outcome.kind === "completed", turnId);
    }
  });

  server.handle(answerPermission, async ({ agentId, deliveryId, permissionId, actionId }, { paseo }) => {
    const root = paseo.agents.ref(agentId);
    const record = await readDelivery(agentId, deliveryId);
    if (!record || record.text || record.failed) return { accepted: false };
    const worker = paseo.agents.ref(record.workerId);
    const snapshot = (await worker.refresh())?.agent;
    if (!ownsWorker(root, snapshot) || snapshot?.metadata?.[deliveryKey] !== deliveryId) {
      return { accepted: false };
    }
    const request = worker.pendingPermissions?.find((item) => item.id === permissionId);
    const action = request?.actions?.find(({ id }) => id === actionId);
    if (!action) return { accepted: false };
    await worker.respondToPermission({
      requestId: permissionId,
      response: { behavior: action.behavior, selectedActionId: action.id },
    });
    return { accepted: true };
  });
  return () => {};
}
