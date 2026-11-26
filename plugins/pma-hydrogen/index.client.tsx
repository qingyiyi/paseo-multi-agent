import type { PluginClientContext, PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { Markdown } from "@getpaseo/plugin/client/ui";
import { Text, View } from "react-native";
import { resultKind, resultSchema, restore } from "./shared/hydrogen";

function HydrogenResult({ item }: PluginTimelineItemProps<{ text: string }>) {
  const { text } = item.data;
  const prefix = /^hydrogen:\r?\n/.exec(text);
  if (!prefix) return <Markdown>{text}</Markdown>;

  return (
    <View style={{ gap: 8 }}>
      <Text
        selectable
        style={{
          alignSelf: "flex-start",
          backgroundColor: "#DBEAFE",
          borderRadius: 6,
          color: "#1E3A8A",
          fontWeight: "700",
          paddingHorizontal: 8,
          paddingVertical: 3,
        }}
      >
        hydrogen:
      </Text>
      <Markdown>{text.slice(prefix[0].length)}</Markdown>
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
