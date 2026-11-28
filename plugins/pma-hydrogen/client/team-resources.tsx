import type { PaseoAgent } from "@getpaseo/client";
import type { PluginClientContext, PluginScreenProps } from "@getpaseo/plugin/client";
import { useRpc } from "@getpaseo/plugin/client";
import { copyText, TextInput, useToast } from "@getpaseo/plugin/client/ui";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { listSaved, readSaved, teamCheck, type SavedItem } from "../shared/team";

export type TeamTheme = PluginScreenProps["theme"];

export function rootRoute(agent: PaseoAgent | undefined) {
  if (agent?.provider === "codex" && agent.model === "gpt-6.2-sol") return "Codex · Sol";
  if (agent?.provider === "antigravity" && agent.model === "gemini-pro-orchestrator-neon") return "Antigravity · Orchestrator（Neon）";
}

export function TeamAction({ title, run, theme }: {
  title: string; run: () => void; theme: TeamTheme;
}) {
  return <Pressable accessibilityRole="button" onPress={run} style={{ paddingVertical: 6 }}>
    <Text style={{ color: theme.colors.accent, fontWeight: "600" }}>{title}</Text>
  </Pressable>;
}

function SavedResults({ agentId, theme }: { agentId: string; theme: TeamTheme }) {
  const list = useRpc(listSaved);
  const read = useRpc(readSaved);
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [revision, setRevision] = useState(0);
  const [results, setResults] = useState<{ items: SavedItem[]; matches: number }>();
  const [requested, setRequested] = useState<string>();
  const [selected, setSelected] = useState<{ id: string; text: string | null }>();
  const [failed, setFailed] = useState(false);
  const { foreground, foregroundMuted, border, surface1 } = theme.colors;

  useEffect(() => {
    let live = true;
    setResults(undefined);
    setFailed(false);
    void list({ agentId, query }).then((value) => { if (live) setResults(value); }, () => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [agentId, list, query, revision]);

  useEffect(() => {
    if (!requested) return;
    let live = true;
    void read({ agentId, requestId: requested }).then(
      ({ text }) => { if (live) setSelected({ id: requested, text }); },
      () => { if (live) setSelected({ id: requested, text: null }); },
    );
    return () => { live = false; };
  }, [agentId, read, requested]);

  function find() {
    setRequested(undefined);
    setSelected(undefined);
    setQuery(search.trim());
    setRevision((value) => value + 1);
  }

  return <View style={{ gap: 8 }}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <TextInput accessibilityLabel="查找已保存的成稿" placeholder="任务号、关键词或日期" placeholderTextColor={foregroundMuted}
        value={search} maxLength={120} onChangeText={setSearch} onSubmitEditing={find}
        style={{ minWidth: 0, flex: 1, color: foreground, padding: 8, borderWidth: 1, borderColor: border, borderRadius: 6 }} />
      <TeamAction title="查找" run={find} theme={theme} />
    </View>
    {failed && <Text style={{ color: foregroundMuted }}>暂时无法读取成稿，可以再次查找。</Text>}
    {!results && !failed && <Text style={{ color: foregroundMuted }}>正在读取已存回执…</Text>}
    {results?.matches === 0 && <Text style={{ color: foregroundMuted }}>{query ? "没有匹配的成稿。" : "此对话还没有已保存的 Hydrogen 成稿。"}</Text>}
    {results && results.matches > results.items.length && <Text style={{ color: foregroundMuted }}>显示最近 {results.items.length} 份，可以继续筛选。</Text>}
    {results?.items.map((entry) => {
      const open = requested === entry.requestId;
      const text = selected?.id === entry.requestId ? selected.text : undefined;
      return <View key={entry.requestId} style={{ backgroundColor: surface1, borderRadius: 8, borderWidth: 1, borderColor: border, padding: 9, gap: 5 }}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => {
          setSelected(undefined);
          setRequested(open ? undefined : entry.requestId);
        }}>
          <Text numberOfLines={2} style={{ color: foreground, fontWeight: "600" }}>{entry.title || entry.requestId}</Text>
          <Text numberOfLines={2} style={{ color: foregroundMuted }}>Hydrogen · {new Date(entry.submittedAt).toLocaleString()} · {entry.requestId}</Text>
        </Pressable>
        {open && text === undefined && <Text style={{ color: foregroundMuted }}>正在读取成稿…</Text>}
        {open && text === null && <Text style={{ color: foregroundMuted }}>成稿暂无可读正文。</Text>}
        {open && text && <>
          <TeamAction title="复制成稿" theme={theme} run={() => {
            void copyText(text).then(() => toast.show("已复制成稿"), () => toast.error("无法复制成稿"));
          }} />
          <Text selectable style={{ color: foreground }}>{text}</Text>
        </>}
      </View>;
    })}
  </View>;
}

function SelfCheck({ agentId, parent, workerCount, mismatch, client, theme }: {
  agentId: string; parent?: PaseoAgent; workerCount: number; mismatch: number; client: PluginClientContext; theme: TeamTheme;
}) {
  const check = useRpc(teamCheck);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ exists: boolean; toolsEnabled: boolean } | "offline" | "plugin-error">();
  useEffect(() => {
    let live = true;
    setResult(undefined);
    void check({ agentId }).then((value) => { if (live) setResult(value); }, async () => {
      if (!live) return;
      const status = await client.paseo.agents.ref(agentId).refresh().then(() => "plugin-error" as const, () => "offline" as const);
      if (live) setResult(status);
    });
    return () => { live = false; };
  }, [agentId, check, client, revision]);

  const route = rootRoute(parent);
  const routeInfo = route ?? (parent ? `当前模型 ${parent.model ?? "未知"}。PMA 主控选择 Codex Sol 或 Antigravity Orchestrator（Neon）。` : "尚未读取主会话模型。");
  const connection = result === "offline" ? "服务端未响应。请检查当前 Paseo 主机连接，再重新检查。"
    : result === "plugin-error" ? "Paseo 已连接，但插件自检暂不可用。请查看服务器上的 PMA 插件状态。"
    : result ? "Paseo 已连接，PMA Hydrogen 插件已响应。" : "正在检查 Paseo 连接…";
  const config = typeof result === "object" ? !result.exists ? "服务端找不到主会话。"
    : result.toolsEnabled ? "服务器允许注入 Paseo 工具。若旧会话缺少工具，请核对会话设置。"
      : "Paseo 协作工具未全部启用。请检查服务器的 Enable Paseo tools 与当前提供商策略。" : null;
  return <View style={{ gap: 5 }}>
    {[routeInfo, connection, config, workerCount ? `已归属此主会话的工作者 · ${workerCount}` : "暂无已关联的 PMA 工作者。",
      mismatch ? `有 ${mismatch} 个会话的 PMA 角色标签缺失或无法识别。` : null].filter(Boolean).map((line) =>
      <Text key={line} style={{ color: theme.colors.foreground }}>{line}</Text>,
    )}
    <TeamAction title="重新检查" run={() => setRevision((value) => value + 1)} theme={theme} />
  </View>;
}

export function TeamResources({ agentId, parent, workerCount, mismatch, client, theme }: {
  agentId: string; parent?: PaseoAgent; workerCount: number; mismatch: number; client: PluginClientContext; theme: TeamTheme;
}) {
  const [tab, setTab] = useState<"saved" | "check" | "help">();
  const toast = useToast();
  const actions = { saved: "成稿", check: "自检", help: "速查" } as const;
  return <View style={{ gap: 8 }}>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16 }}>
      {Object.entries(actions).map(([key, title]) => <Pressable key={key} accessibilityRole="button"
        accessibilityState={{ expanded: tab === key }} onPress={() => setTab(tab === key ? undefined : key as keyof typeof actions)}
        style={{ paddingVertical: 5 }}>
        <Text style={{ fontWeight: "600", color: tab === key ? theme.colors.foreground : theme.colors.accent }}>{title}</Text>
      </Pressable>)}
    </View>
    {tab === "saved" && <SavedResults key={agentId} agentId={agentId} theme={theme} />}
    {tab === "check" && <SelfCheck key={agentId} agentId={agentId} parent={parent} workerCount={workerCount} mismatch={mismatch} client={client} theme={theme} />}
    {tab === "help" && <View style={{ gap: 5 }}>
      <Text style={{ color: theme.colors.foreground }}>看进度，点 PMA。找已有结果，点「成稿」。发起新协作，用 /pma。</Text>
      <TeamAction title="复制协作模板" theme={theme} run={() => {
        void copyText("/pma 目标：\n验收标准：\n权限或限制：").then(
          () => toast.show("已复制模板，可粘贴到输入框"), () => toast.error("无法复制模板"),
        );
      }} />
    </View>}
  </View>;
}
