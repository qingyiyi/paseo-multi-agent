import type { PluginClientContext, PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { useRpc } from "@getpaseo/plugin/client";
import { Markdown } from "@getpaseo/plugin/client/ui";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { z } from "zod";
import {
  answerPermission, permissionKind, permissionSchema, resultKind, resultSchema, restore,
  statusKind, statusSchema,
} from "./shared/hydrogen";

const opus = { color: "#991B1B", backgroundColor: "#FEE2E2" };
const modelColors = {
  "hydrogen:": { color: "#1E3A8A", backgroundColor: "#DBEAFE" },
  "[Opus]": opus,
  "[Opus 5.5]": opus,
  "[Neon]": { color: "#854D0E", backgroundColor: "#FEF3C7" },
  "[Astra]": { color: "#6B21A8", backgroundColor: "#F3E8FF" },
};
type ModelLabel = keyof typeof modelColors;
type MarkdownPart = { text: string } | { labels: ModelLabel[] };

const modelLabel = /\[(?:Opus(?: 5\.5)?|Neon|Astra)\]/g;

function splitModelLabels(source: string): MarkdownPart[] {
  // Reference links can point to definitions in later paragraphs.
  if (/^ {0,3}\[[^\]\n]+\]:/m.test(source)) return [{ text: source }];

  const lines = source.split(/(?<=\n)/);
  const parts: MarkdownPart[] = [];
  let markdown = "";
  let fence: string | undefined;

  for (const [index, line] of lines.entries()) {
    const marker = /^ {0,3}(`{3,}|~{3,})([^\r\n]*)/.exec(line);
    if (marker) {
      const [, run, rest] = marker;
      if (!fence && (run[0] === "~" || !rest.includes("`"))) fence = run;
      else if (fence && run[0] === fence[0] && run.length >= fence.length && !rest.trim()) {
        fence = undefined;
      }
    }

    const standalone = !fence && !lines[index - 1]?.trim() && !lines[index + 1]?.trim();
    if (standalone && line.startsWith("[") && !line.replace(modelLabel, "").trim()) {
      if (markdown.trim()) parts.push({ text: markdown });
      parts.push({ labels: line.match(modelLabel) as ModelLabel[] });
      markdown = "";
    } else {
      markdown += line;
    }
  }
  if (markdown.trim()) parts.push({ text: markdown });
  return parts;
}

function Badge({ label }: { label: ModelLabel }) {
  return (
    <Text
      selectable
      style={{
        alignSelf: "flex-start",
        borderRadius: 6,
        fontWeight: "700",
        paddingHorizontal: 8,
        paddingVertical: 3,
        ...modelColors[label],
      }}
    >
      {label}
    </Text>
  );
}

function HydrogenResult({ item }: PluginTimelineItemProps<{ text: string }>) {
  const { text } = item.data;
  const prefix = /^hydrogen:\r?\n/.exec(text);
  const parts = splitModelLabels(text.slice(prefix?.[0].length ?? 0));

  return (
    <View style={{ gap: 8 }}>
      {prefix && <Badge label="hydrogen:" />}
      {parts.map((part, index) =>
        "labels" in part ? (
          <View key={index} style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {part.labels.map((label, index) => <Badge key={index} label={label} />)}
          </View>
        ) : (
          <Markdown key={index}>{part.text}</Markdown>
        ),
      )}
    </View>
  );
}

function PermissionCard({ agentId, item, theme }: PluginTimelineItemProps<z.output<typeof permissionSchema>>) {
  const respond = useRpc(answerPermission);
  const [state, setState] = useState<"ready" | "sending" | "sent" | "stale" | "error">("ready");
  const { deliveryId, permissionId, title, detail, actions } = item.data;
  const { foreground, foregroundMuted, surface1, border, accent, accentForeground } = theme.colors;

  async function choose(actionId: string) {
    setState("sending");
    try {
      const { accepted } = await respond({ agentId, deliveryId, permissionId, actionId });
      setState(accepted ? "sent" : "stale");
    } catch {
      setState("error");
    }
  }

  return (
    <View style={{ backgroundColor: surface1, borderColor: border, borderWidth: 1, borderRadius: 8, padding: 12, gap: 8 }}>
      <Text style={{ color: foreground, fontWeight: "700" }}>Hydrogen 等待确认</Text>
      <Text selectable style={{ color: foreground }}>{title}</Text>
      {detail && <Text selectable style={{ color: foregroundMuted }}>{detail}</Text>}
      {state === "error" && <Text style={{ color: theme.colors.statusDanger }}>提交失败，请重试。</Text>}
      {state === "stale" && <Text style={{ color: foregroundMuted }}>这项请求已关闭或已处理。</Text>}
      {state === "sent" && <Text style={{ color: foregroundMuted }}>已提交，等待 Hydrogen 继续。</Text>}
      {actions.length > 0 && (state === "ready" || state === "sending" || state === "error") && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {actions.map((action) => (
            <Pressable
              key={action.id}
              accessibilityRole="button"
              disabled={state === "sending"}
              onPress={() => { void choose(action.id); }}
              style={{
                backgroundColor: action.behavior === "allow" ? accent : surface1,
                borderWidth: 1, borderColor: border, borderRadius: 6,
                paddingHorizontal: 10, paddingVertical: 6,
              }}
            >
              <Text style={{ color: action.behavior === "allow" ? accentForeground : foreground }}>{action.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

function DeliveryStatus({ item, theme }: PluginTimelineItemProps<z.output<typeof statusSchema>>) {
  return <Text style={{ color: theme.colors.foregroundMuted }}>{item.data.title}</Text>;
}

export default function contribute(client: PluginClientContext) {
  client.addTimelineRenderer({
    kind: resultKind,
    version: 1,
    schema: resultSchema,
    Component: HydrogenResult,
  });
  client.addTimelineRenderer({
    kind: permissionKind,
    version: 1,
    schema: permissionSchema,
    Component: PermissionCard,
  });
  client.addTimelineRenderer({
    kind: statusKind,
    version: 1,
    schema: statusSchema,
    Component: DeliveryStatus,
  });

  client.addSlashCommand({
    name: "pma-replay",
    description: "恢复此对话已保存的成稿及待处理的 Hydrogen 请求",
    argumentHint: "",
    context: "agent",
    async onSubmit({ agent, rpc }) {
      await rpc(restore, { agentId: agent.id });
    },
  });

  return () => {};
}
