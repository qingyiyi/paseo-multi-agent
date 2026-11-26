import type { PluginClientContext, PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { Markdown } from "@getpaseo/plugin/client/ui";
import { Text, View } from "react-native";
import { resultKind, resultSchema, restore } from "./shared/hydrogen";

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

export default function contribute(client: PluginClientContext) {
  client.addTimelineRenderer({
    kind: resultKind,
    version: 1,
    schema: resultSchema,
    Component: HydrogenResult,
  });

  client.addSlashCommand({
    name: "pma-replay",
    description: "恢复此对话已保存的 Hydrogen 成稿",
    argumentHint: "",
    context: "agent",
    async onSubmit({ agent, rpc }) {
      await rpc(restore, { agentId: agent.id });
    },
  });

  return () => {};
}
