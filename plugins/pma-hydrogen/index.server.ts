import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { defineAgentTool } from "@getpaseo/plugin/server";
import type { AgentToolContext, PluginServerContext } from "@getpaseo/plugin/server";
import { z } from "zod";
import { idSchema, resultKind, restore } from "./shared/hydrogen";
import { readDeliveries, readDelivery, requestSchema, rootDirectory, writeDelivery } from "./server/storage";

type Paseo = AgentToolContext["paseo"];
type Agent = ReturnType<Paseo["agents"]["ref"]>;

const provider = "antigravity";
const model = "gemini-4-hydrogen";
const rootKey = "pma-hydrogen.root";
const workerKey = "pma-hydrogen.worker";
const active = new Set<string>();
const displayed = new Set<string>();

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
  if (force && deliveries.some(({ record }) => record?.text)) {
    // A conversation may be unopened after a daemon restart.
    const history = await root.timeline.refetch({ direction: "tail", limit: 1 });
    if (history.error || history.agent?.provider !== "codex" || history.agent.archivedAt) {
      throw new Error("无法打开此主对话以恢复成稿。");
    }
  }

  let count = 0;
  for (const { requestId, record } of deliveries) {
    if (record?.text && (force || !displayed.has(agentId + "/" + requestId))) {
      await display(root, requestId, record.text);
      count++;
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
      if (reuse && snapshot.provider === provider && snapshot.model === model && snapshot.status === "idle") {
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
    config: { provider: provider + "/" + model },
    title: "PMA Hydrogen",
    metadata: { [rootKey]: root.id },
  });
  await root.setMetadata({ [workerKey]: worker.id });
  return worker;
}

async function collect(worker: Agent, messageId: string) {
  const history = await worker.timeline.refetch({ direction: "tail", limit: 1, wholeTurns: true });
  const latest = history.entries.findLastIndex(({ item }) => item.type === "user_message");
  const prompt = history.entries[latest]?.item;
  if (history.error || prompt?.type !== "user_message" ||
      (prompt.clientMessageId !== messageId && prompt.messageId !== messageId)) {
    throw new Error("无法确认 Hydrogen 的回复对应这项交接。");
  }
  const pieces = history.entries.slice(latest + 1).flatMap(({ item }) =>
    item.type === "assistant_message" ? [item.text] : [],
  );
  const body = pieces.join("\n\n").trim().replace(/^hydrogen:[ \t]*(?:\r?\n|$)/i, "").trim();
  if (!body) throw new Error("本次 Hydrogen 没有可回显的正文。");
  return "hydrogen:\n" + body;
}

const publishHydrogen = defineAgentTool({
  name: "pma_hydrogen",
  description: "Use the configured official Hydrogen provider for a short reply or final polish, and display the result only in the original Paseo conversation. This tool returns delivery status only.",
  input: z.object({
    requestId: requestSchema.describe("Stable unique ID for this delivery. Retry with exactly the same ID."),
    rootAgentId: idSchema.optional().describe("Original Paseo Codex ID. Omit from the main conversation, required from its Astra subagent."),
    kind: z.enum(["chat", "polish"]),
    brief: z.string().trim().min(1).describe("Only the current request or verified draft and necessary writing constraints."),
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
      if (!record?.text) {
        const worker = record ? paseo.agents.ref(record.workerId) : await getWorker(paseo, root, input.reuseWorker);
        if (!record) {
          const messageId = randomUUID();
          record = { workerId: worker.id, messageId, submittedAt: Date.now() };
          await writeDelivery(root.id, input.requestId, record);
          const mode = input.kind === "chat"
            ? "根据下面的简短交接直接回复用户。"
            : "只润色下面已核实的定稿。保留结论、数字、公式、引用、不确定性和各模型来源标签。";
          const prompt = mode + "\n不调用工具、不读取工作区。只输出交付正文，第一行单独写 hydrogen:。\n\n" + input.brief;
          await worker.send(prompt, { messageId });
        }

        const outcome = await worker.waitForFinish(180_000);
        if (outcome.status !== "idle") {
          throw new Error("Hydrogen 未完成本次任务，状态为 " + outcome.status + "。");
        }
        record.text = await collect(worker, record.messageId);
        await writeDelivery(root.id, input.requestId, record);
      }

      await display(root, input.requestId, record.text);
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
  return () => {};
}
