import type { PluginClientContext, PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { useRpc } from "@getpaseo/plugin/client";
import { copyText, Icon, useToast } from "@getpaseo/plugin/client/ui";
import { fromMarkdown } from "mdast-util-from-markdown";
import { MathMarkdown, canUseMathMarkdown, splitMathBlocks } from "./client/math-blocks";
import { installModelLabelColors, modelColors, modelLabelSource } from "./client/model-labels";
import { contributeTeam } from "./client/team";
import { useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import type { z } from "zod";
import {
  answerPermission, permissionKind, permissionSchema, resultKind, resultSchema, restore,
  statusKind, statusSchema,
} from "./shared/hydrogen";

type ModelLabel = keyof typeof modelColors;
type MarkdownPart = { text: string } | { labels: ModelLabel[] };

const modelLabel = new RegExp(modelLabelSource, "g");
const labelToken = `(?:${modelLabelSource}|\`${modelLabelSource}\`)`;
const modelLabelLine = new RegExp(
  String.raw`^${labelToken}(?:[ \t]*(?:[&＆][ \t]*)?${labelToken})*[ \t]*\r?$`,
  "m",
);
const assistantMathKind = "assistant-display-math";

function splitModelLabels(source: string): MarkdownPart[] {
  if (!modelLabelLine.test(source)) return [{ text: source }];
  // Reference links can point to definitions in later paragraphs.
  if (/^ {0,3}\[[^\]\n]+\]:/m.test(source)) return [{ text: source }];

  const lines = source.split(/(?<=\n)/);
  // Markdown can end a paragraph at a list marker without an intervening blank line.
  const labelLines = new Set<number>();
  for (const node of fromMarkdown(source).children) {
    if (node.type !== "paragraph" || !node.position) continue;
    const { start, end } = node.position;
    if (start.line === end.line && modelLabelLine.test(lines[start.line - 1])) {
      labelLines.add(start.line - 1);
    }
  }

  const formulas = splitMathBlocks(source).filter((part) => part.expression !== undefined);
  let formulaIndex = 0;
  const parts: MarkdownPart[] = [];
  let markdown = "";

  for (const [index, line] of lines.entries()) {
    while (formulas[formulaIndex]?.lastLine < index) formulaIndex += 1;
    const inFormula = formulas[formulaIndex]?.firstLine <= index;
    if (!inFormula && labelLines.has(index)) {
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

function ModelLabeledMarkdown({ text, foreground, hydrogen = false }: { text: string; foreground: string; hydrogen?: boolean }) {
  const prefix = hydrogen ? /^hydrogen:\r?\n/.exec(text) : null;
  const parts = splitModelLabels(text.slice(prefix?.[0].length ?? 0));

  return (
    <View testID="pma-model-markdown" style={{ gap: 8 }}>
      {prefix && <Badge label="hydrogen:" />}
      {parts.map((part, index) =>
        "labels" in part ? (
          <View key={index} style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {part.labels.map((label, index) => <Badge key={index} label={label} />)}
          </View>
        ) : (
          <MathMarkdown key={index} text={part.text} foreground={foreground} />
        ),
      )}
    </View>
  );
}

function HydrogenResult({ item, theme }: PluginTimelineItemProps<{ text: string }>) {
  return <ModelLabeledMarkdown text={item.data.text} foreground={theme.colors.foreground} hydrogen />;
}

function AssistantMarkdown({ item, theme }: PluginTimelineItemProps<{ text: string }>) {
  const toast = useToast();
  const text = item.data.text;

  async function copySource() {
    try {
      await copyText(text);
      toast.show("已复制原文", { variant: "success" });
    } catch {
      toast.error("无法复制原文");
    }
  }

  return (
    <View style={{ minWidth: 0, width: "100%" }}>
      <ModelLabeledMarkdown text={text} foreground={theme.colors.foreground} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="复制原文"
        onPress={() => { void copySource(); }}
        style={{ alignSelf: "flex-end", padding: 8 }}
      >
        <Icon name="Copy" size={14} color={theme.colors.foregroundMuted} />
      </Pressable>
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
  client.addTimelineTransformer({
    id: assistantMathKind,
    query: { itemType: "assistant_message" },
    transform({ item, phase }) {
      if (phase !== "complete") return;
      const hasLabels = splitModelLabels(item.text).some((part) => "labels" in part);
      if (!canUseMathMarkdown(item.text, hasLabels)) return;
      return { items: [{ type: "plugin", kind: assistantMathKind, version: 1, data: { text: item.text } }] };
    },
  });
  client.addTimelineRenderer({
    kind: assistantMathKind,
    version: 1,
    schema: resultSchema,
    Component: AssistantMarkdown,
  });
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

  const stopTeam = contributeTeam(client);
  const stopColors = Platform.OS === "web" ? installModelLabelColors() : undefined;
  return () => {
    stopTeam();
    stopColors?.();
  };
}
