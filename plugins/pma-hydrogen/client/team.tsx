import type { PaseoAgent, PaseoAgentListResult } from "@getpaseo/client";
import type { ComponentType } from "react";
import type { PluginButtonContentProps, PluginButtonRegistration, PluginClientContext, PluginScreenProps } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/ui";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { rootRoute, TeamAction, TeamResources, type TeamTheme } from "./team-resources";

const screenId = "pma-team";
const parentLabel = "paseo.parent-agent-id";
const rootLabel = "paseo-workflow-root";
const roleLabel = "paseo-workflow-role";
const hydrogenRoot = "pma-hydrogen.root";
const roles: Readonly<Record<string, string>> = {
  astra: "Astra", sol: "Sol（执行）", terra: "Terra", neon: "Neon", opus: "Opus", hydrogen: "Hydrogen",
};

function workerIdentity(agent: PaseoAgent) {
  const root = agent.labels?.[rootLabel];
  const role = agent.labels?.[roleLabel];
  if (root && role && Object.hasOwn(roles, role)) return { root, role };
  const owner = agent.metadata?.[hydrogenRoot];
  if (typeof owner === "string" && agent.provider === "antigravity" && agent.model === "gemini-4-hydrogen") {
    return { root: owner, role: "hydrogen" };
  }
}

function workerState(agent: PaseoAgent) {
  if (agent.archivedAt) return "closed";
  if (agent.pendingPermissions.length || agent.attentionReason === "permission") return "permission";
  if (agent.status === "error" || agent.providerUnavailable) return "error";
  if (agent.status === "running" || (agent.backgroundWork?.runningCount ?? 0) > 0) return "running";
  return agent.status;
}

const stateLabels = {
  permission: "待授权", error: "异常", running: "执行中", initializing: "启动中", idle: "空闲", closed: "已关闭",
};
const priority = { permission: 0, error: 1, running: 2, initializing: 3, idle: 4, closed: 5 };

function teamStore(client: PluginClientContext, popover: ComponentType<PluginButtonContentProps>) {
  const lifetime = new AbortController();
  const listeners = new Set<() => void>();
  const pills = new Map<string, { registration: PluginButtonRegistration<string>; label: string; workspace: string }>();
  const options = { includeBackground: true, filter: { includeArchived: true }, page: { limit: 100 } };
  let view = { agents: new Map<string, PaseoAgent>(), state: "loading" as "loading" | "ready" | "error", checkedAt: 0 };
  let agents = new Map<string, PaseoAgent>();
  let generation = 0;
  let liveChanges: Map<string, PaseoAgent | null> | null = null;

  function publish(state: typeof view.state) {
    const teams = new Map<string, PaseoAgent[]>();
    for (const agent of agents.values()) {
      const identity = workerIdentity(agent);
      if (!identity) continue;
      const members = teams.get(identity.root) ?? [];
      members.push(agent);
      teams.set(identity.root, members);
    }
    for (const agent of agents.values()) {
      if (rootRoute(agent) && !teams.has(agent.id)) teams.set(agent.id, []);
    }

    for (const [root, members] of teams) {
      const parent = agents.get(root);
      const workspace = parent?.workspaceId;
      if (!workspace || parent.archivedAt || parent.background || parent.labels?.[parentLabel]) {
        teams.delete(root);
        continue;
      }
      const states = members.map(workerState);
      const running = states.filter((value) => value === "running" || value === "initializing").length;
      const permission = states.filter((value) => value === "permission").length;
      const errors = states.filter((value) => value === "error").length;
      const label = ["PMA", running && `${running} 执行中`, permission && `${permission} 待授权`, errors && `${errors} 异常`].filter(Boolean).join(" · ");
      const current = pills.get(root);
      if (current?.workspace === workspace) {
        if (current.label !== label) {
          current.registration.update({ label });
          current.label = label;
        }
        continue;
      }
      current?.registration.remove();
      const registration = client.addComposerPill({
        id: screenId, workspaceId: workspace, agentId: root,
        button: {
          title: "查看 PMA 子代理", label, icon: "Users",
          behavior: { kind: "popover", Content: popover },
        },
      });
      pills.set(root, { registration, label, workspace });
    }
    for (const [root, { registration }] of pills) {
      if (!teams.has(root)) {
        registration.remove();
        pills.delete(root);
      }
    }
    view = { agents: new Map(agents), state, checkedAt: state === "ready" ? Date.now() : view.checkedAt };
    listeners.forEach((notify) => notify());
  }

  async function replace(first: PaseoAgentListResult) {
    const version = ++generation;
    const snapshot = new Map(first.entries.map(({ agent }) => [agent.id, agent]));
    const changes = new Map<string, PaseoAgent | null>();
    liveChanges = changes;
    try {
      let page = first;
      while (page.pageInfo.hasMore && page.pageInfo.nextCursor) {
        page = await client.paseo.agents.list({ ...options, page: { ...options.page, cursor: page.pageInfo.nextCursor }, signal: lifetime.signal });
        if (version !== generation || lifetime.signal.aborted) return;
        for (const { agent } of page.entries) snapshot.set(agent.id, agent);
      }
      if (lifetime.signal.aborted) return;
      for (const [id, agent] of changes) {
        if (agent) snapshot.set(id, agent);
        else snapshot.delete(id);
      }
      agents = snapshot;
      publish("ready");
    } catch {
      if (version === generation && !lifetime.signal.aborted) publish("error");
    } finally {
      if (liveChanges === changes) liveChanges = null;
    }
  }

  void client.paseo.agents.list({ ...options, subscribe: {}, signal: lifetime.signal }).then(({ subscription }) => {
    if (lifetime.signal.aborted) return;
    subscription.subscribe({
      snapshot: (snapshot) => { void replace(snapshot); },
      update(message) {
        if (lifetime.signal.aborted || message.type !== "agent_update") return;
        const update = message.payload;
        if (update.kind === "remove") {
          liveChanges?.set(update.agentId, null);
          agents.delete(update.agentId);
        } else {
          liveChanges?.set(update.agent.id, update.agent);
          agents.set(update.agent.id, update.agent);
        }
        publish(view.state);
      },
      error() {
        if (!lifetime.signal.aborted) publish("error");
      },
    });
  }).catch(() => {
    if (!lifetime.signal.aborted) publish("error");
  });

  return {
    read: () => view,
    listen(notify: () => void) {
      listeners.add(notify);
      return () => { listeners.delete(notify); };
    },
    stop() {
      lifetime.abort();
      for (const { registration } of pills.values()) registration.remove();
      pills.clear();
      listeners.clear();
    },
  };
}

type TurnPreview = { id: string; task: string; summary?: string };

function preview(text: string, limit: number) {
  const line = text.trim().split(/\r?\n/, 1)[0].replace(/\s+/g, " ");
  return line.length > limit ? line.slice(0, limit - 1) + "…" : line;
}

const taskNumber = /\b[A-Z]{1,5}\d{2,}(?:[–—-][A-Z]{1,5}\d{2,})?\b/;

function taskPreview(text: string) {
  const line = preview(text, 150);
  const task = taskNumber.exec(text.slice(0, 480))?.[0];
  return task && !line.includes(task) ? `${task} · ${line}` : line;
}

function useRecentTurns(client: PluginClientContext, agent: PaseoAgent, enabled: boolean) {
  const revision = `${agent.activeTurn?.turnId ?? ""}/${agent.lastUserMessageAt ?? ""}/${agent.status}`;
  const [result, setResult] = useState<{ revision: string; turns: TurnPreview[]; error?: boolean }>();
  useEffect(() => {
    if (!enabled) return;
    let current = true;
    void client.paseo.agents.ref(agent.id).timeline.refetch({ direction: "tail", limit: 64 }).then(({ entries, error }) => {
      if (error) throw new Error(error);
      const turns: TurnPreview[] = [];
      let turn: TurnPreview | undefined;
      for (const { item, seqStart, turnId } of entries) {
        if (item.type === "user_message") {
          if (item.text.trimStart().startsWith("<paseo-system")) {
            turn = undefined;
            continue;
          }
          turn = { id: item.messageId ?? String(seqStart), task: taskPreview(item.text) };
          turns.push(turn);
        } else if (item.type === "assistant_message" && turn && turnId !== agent.activeTurn?.turnId) {
          turn.summary = preview(item.text, 220);
        } else if (item.type === "error" && turn) {
          turn.summary = preview(item.message, 220);
        }
      }
      if (current) setResult({ revision, turns: turns.slice(-4).reverse() });
    }).catch(() => {
      if (current) setResult({ revision, turns: [], error: true });
    });
    return () => { current = false; };
  }, [agent.id, client, enabled, revision]);
  return result?.revision === revision ? result : undefined;
}

function WorkerRow({ agent, client, theme, openAgent, returnRoot }: {
  agent: PaseoAgent; client: PluginClientContext; theme: TeamTheme;
  openAgent?: (id: string) => void; returnRoot?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { foreground, foregroundMuted, border, surface1, accent, statusWarning, statusDanger } = theme.colors;
  const state = workerState(agent);
  const permission = agent.pendingPermissions;
  const identity = workerIdentity(agent);
  const role = roles[identity?.role ?? ""] ?? agent.provider;
  const recent = useRecentTurns(client, agent, expanded || state === "running" || state === "permission" || state === "error");
  const latest = recent?.turns[0];
  const color = state === "permission" ? statusWarning : state === "error" ? statusDanger : state === "running" ? accent : foregroundMuted;
  const model = [agent.model, agent.effectiveThinkingOptionId ?? agent.thinkingOptionId].filter(Boolean).join(" · ");
  const activity = new Date(agent.updatedAt).toLocaleString(undefined, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const attention = state === "permission" || state === "error";
  const onRoot = state === "permission" && identity?.role === "hydrogen";

  return (
    <View style={{ borderWidth: 1, borderColor: border, borderRadius: 10, backgroundColor: surface1 }}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)}
        style={{ padding: 12, gap: 5 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ flex: 1, color: foreground, fontWeight: "700" }}>{role}</Text>
          <Text style={{ color, fontWeight: "600" }}>{agent.status === "idle" && state === "running" ? "后台工作中" : stateLabels[state]}</Text>
          <Icon name={expanded ? "ChevronUp" : "ChevronDown"} size={15} color={foregroundMuted} />
        </View>
        <Text numberOfLines={2} style={{ color: foreground }}>{latest?.task || agent.title || "尚无任务名称"}</Text>
        {permission.length > 0 && <Text numberOfLines={2} style={{ color: statusWarning }}>
          {permission[0].title || permission[0].name}{permission.length > 1 ? ` 等 ${permission.length} 项请求` : ""}
        </Text>}
        {state === "error" && agent.lastError && <Text numberOfLines={2} style={{ color: statusDanger }}>{preview(agent.lastError, 150)}</Text>}
        {attention && <Text style={{ color: foregroundMuted }}>最近状态更新 · {activity}</Text>}
      </Pressable>
      {attention && <View style={{ paddingHorizontal: 12 }}>
        {onRoot && returnRoot ? <TeamAction title="回主对话授权" run={returnRoot} theme={theme} />
          : openAgent && <TeamAction title={state === "permission" ? "打开子会话处理授权" : "打开子会话查看异常"}
            run={() => openAgent(agent.id)} theme={theme} />}
      </View>}
      {expanded && <View style={{ padding: 12, paddingTop: 0, gap: 9 }}>
        <Text style={{ color: foregroundMuted }}>{[model, activity].filter(Boolean).join(" · ")}</Text>
        {permission.slice(1).map((request) => <Text key={request.id} style={{ color: statusWarning }}>{request.title || request.name}</Text>)}
        {state === "permission" && identity?.role === "hydrogen" && <Text style={{ color: foregroundMuted }}>请在原主对话的授权卡上处理。</Text>}
        {!recent && <Text style={{ color: foregroundMuted }}>正在读取最近任务…</Text>}
        {recent?.error && <Text style={{ color: foregroundMuted }}>暂时无法读取任务记录。</Text>}
        {recent?.turns.map((turn, index) => <View key={turn.id} style={{ gap: 3 }}>
          {index > 0 && <Text style={{ color: foregroundMuted }}>{turn.task}</Text>}
          {turn.summary && <Text selectable style={{ color: foreground }}>{turn.summary}</Text>}
        </View>)}
        {openAgent && <Pressable accessibilityRole="button" onPress={() => openAgent(agent.id)}>
          <Text style={{ color: accent, fontWeight: "600", paddingVertical: 3 }}>打开子会话</Text>
        </Pressable>}
      </View>}
    </View>
  );
}

export function contributeTeam(client: PluginClientContext) {
  const store = teamStore(client, TeamPopover);

  function TeamBody({ agentId, theme, openAgent, onReturn }: {
    agentId: string; theme: TeamTheme; openAgent?: (id: string) => void; onReturn?: (id: string) => void;
  }) {
    const [history, setHistory] = useState(false);
    const { agents, state, checkedAt } = useSyncExternalStore(store.listen, store.read);
    const subject = agents.get(agentId);
    const root = (subject && workerIdentity(subject)?.root) ?? agentId;
    const parent = agents.get(root);
    const mismatch = [...agents.values()].filter((agent) => agent.labels?.[rootLabel] === root && !workerIdentity(agent)).length;
    const workers = [...agents.values()].filter((agent) => workerIdentity(agent)?.root === root).sort((a, b) =>
      priority[workerState(a)] - priority[workerState(b)] || b.updatedAt.localeCompare(a.updatedAt),
    );
    const active = workers.filter((agent) => priority[workerState(agent)] < priority.idle);
    const previous = workers.filter((agent) => priority[workerState(agent)] >= priority.idle);
    const { foreground, foregroundMuted, border } = theme.colors;
    const returnRoot = onReturn && (() => onReturn(root));
    const rows = (members: PaseoAgent[]) => members.map((agent) =>
      <WorkerRow key={agent.id} agent={agent} client={client} theme={theme} openAgent={openAgent} returnRoot={returnRoot} />,
    );

    return (
      <View style={{ gap: 8 }}>
        {state === "loading" && <Text style={{ color: foregroundMuted }}>正在读取子代理状态…</Text>}
        {state === "error" && <Text style={{ color: foregroundMuted }}>
          实时状态暂不可用。{checkedAt ? `最后同步 ${new Date(checkedAt).toLocaleTimeString()}。` : "尚未同步。"}
        </Text>}
        {state === "ready" && !active.length && <Text style={{ color: foregroundMuted }}>
          {workers.length ? "当前没有正在处理的任务。" : "此对话还没有 PMA 子代理。"}
        </Text>}
        {rows(active)}
        {previous.length > 0 && <Pressable accessibilityRole="button" accessibilityState={{ expanded: history }}
          onPress={() => setHistory(!history)} style={{ flexDirection: "row", gap: 8, alignItems: "center", borderTopWidth: 1, borderColor: border, paddingVertical: 10 }}>
          <Icon name={history ? "ChevronUp" : "ChevronDown"} size={15} color={foregroundMuted} />
          <Text style={{ color: foreground }}>空闲与历史 · {previous.length}</Text>
        </Pressable>}
        {history && rows(previous)}
        {workers.length > 0 && <Text style={{ color: foregroundMuted }}>这里显示代理轮次状态。任务验收以主对话为准。</Text>}
        <TeamResources agentId={root} parent={parent} workerCount={workers.length} mismatch={mismatch} client={client} theme={theme} />
      </View>
    );
  }

  function TeamPopover(props: PluginButtonContentProps) {
    if (props.context !== "agent") return null;
    const { agentId, theme, close } = props;
    function openAgent(workerId: string) {
      close();
      // The host's anchored popover does not expose navigation. Existing composers can focus directly.
      const [composer] = client.composers({ agentId: workerId });
      const openOnHost = () => client.openScreen({ screenId, params: { agentId, workerId } });
      if (composer) void composer.focus().catch(openOnHost);
      else openOnHost();
    }
    return <TeamBody agentId={agentId} theme={theme} openAgent={openAgent} onReturn={close} />;
  }

  function TeamScreen({ params, navigation, host, theme }: PluginScreenProps) {
    const { agents } = useSyncExternalStore(store.listen, store.read);
    const { agentId, workerId } = params;
    const subject = agents.get(agentId);
    const root = (subject && workerIdentity(subject)?.root) ?? agentId;
    const worker = agents.get(workerId);
    const navigate = navigation?.openAgent;
    const destination = worker && workerIdentity(worker)?.root === root ? worker.id : null;
    useEffect(() => {
      if (destination) navigate?.({ agentId: destination, serverId: host.id });
    }, [destination, navigate, host.id]);

    if (destination && navigate) return null;
    return (
      <ScrollView style={{ backgroundColor: theme.colors.surface0 }} contentContainerStyle={{ padding: 16 }}>
        <View style={{ width: "100%", maxWidth: 760, alignSelf: "center", gap: 12 }}>
          {navigate && <Pressable accessibilityRole="button" onPress={() => navigate({ agentId: root, serverId: host.id })}>
            <Text style={{ color: theme.colors.accent, fontWeight: "600" }}>返回主对话</Text>
          </Pressable>}
          <TeamBody agentId={agentId} theme={theme}
            openAgent={navigate && ((id) => navigate({ agentId: id, serverId: host.id }))}
            onReturn={navigate && ((id) => navigate({ agentId: id, serverId: host.id }))} />
        </View>
      </ScrollView>
    );
  }

  client.addScreen({ id: screenId, title: "PMA 子代理", Component: TeamScreen });
  client.addSlashCommand({
    name: "pma-status", description: "查看当前 PMA 对话的子代理", argumentHint: "", context: "agent",
    onSubmit({ agent, openScreen }) { openScreen({ screenId, params: { agentId: agent.id } }); },
  });
  return store.stop;
}
