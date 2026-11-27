import { useRpc } from "@getpaseo/plugin/client";
import { Markdown } from "@getpaseo/plugin/client/ui";
import { useEffect, useState } from "react";
import { Image, ScrollView, Text, processColor } from "react-native";
import { renderMath } from "../shared/render-math";
import type { RenderOutput } from "../shared/render-math";
import { getReferenceDefinitions, prepareMarkdown } from "./markdown-source";

type Part = { source: string; expression?: string };

export function splitMathBlocks(text: string): Part[] {
  const lines = text.split(/(?<=\n)/);
  const parts: Part[] = [];
  let markdownStart = 0;
  let fence: string | undefined;
  let opening: { line: number; close: string } | undefined;

  for (const [index, line] of lines.entries()) {
    const marker = /^ {0,3}(`{3,}|~{3,})([^\r\n]*)/.exec(line);
    if (marker) {
      const [, run, rest] = marker;
      if (!fence && (run[0] === "~" || !rest.includes("`"))) {
        fence = run;
        opening = undefined;
      } else if (fence && run[0] === fence[0] && run.length >= fence.length && !rest.trim()) {
        fence = undefined;
      }
      continue;
    }
    if (fence) continue;

    let first = index;
    let expression: string | undefined;
    const delimiter = /^ {0,3}(\$\$|\\\[|\\\])[ \t]*(?:\r?\n)?$/.exec(line)?.[1];
    if (opening) {
      if (delimiter !== opening.close) continue;
      first = opening.line;
      expression = lines.slice(first + 1, index).join("").trim();
      opening = undefined;
    } else if (delimiter === "$$" || delimiter === "\\[") {
      opening = { line: index, close: delimiter === "$$" ? "$$" : "\\]" };
      continue;
    } else {
      expression = /^ {0,3}(?:\$\$(.+?)\$\$|\\\[(.+?)\\\])[ \t]*(?:\r?\n)?$/
        .exec(line)?.slice(1).find(Boolean)?.trim();
    }
    if (!expression) continue;

    const markdown = lines.slice(markdownStart, first).join("");
    if (markdown.trim()) parts.push({ source: markdown });
    parts.push({ expression, source: lines.slice(first, index + 1).join("") });
    markdownStart = index + 1;
  }
  const remaining = lines.slice(markdownStart).join("");
  if (remaining.trim()) parts.push({ source: remaining });
  return parts;
}

export function usesStandaloneMath(text: string): boolean {
  if (!/(?:\$\$|\\\[)/.test(text)) return false;
  const parts = splitMathBlocks(text);
  // Leave other math syntax to the existing math plugin, including mixed messages.
  return parts.some(({ expression }) => expression) && parts.every(({ expression, source }) =>
    expression || !/(?:\$|\\\(|\\\[|^ {0,3}(?:`{3,}|~{3,})[ \t]*(?:math|latex|tex)\b)/im.test(source),
  );
}

function MathBlock({ expression, source, color }: { expression: string; source: string; color: string }) {
  const render = useRpc(renderMath);
  const [result, setResult] = useState<RenderOutput>();
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => {
    if (expression.length > 4096) return;
    let mounted = true;
    void render({ expression, display: true, color }).then(
      (value) => { if (mounted) setResult(value); },
      () => { if (mounted) setResult({ ok: false, reason: "invalid" }); },
    );
    return () => { mounted = false; };
  }, [render, expression, color]);

  return (
    <ScrollView horizontal style={{ width: "100%", flexGrow: 0 }}
      contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingVertical: 4 }}>
      {result?.ok && !imageFailed ? (
        <Image
          source={{ uri: `data:image/png;base64,${result.png}` }}
          accessible
          accessibilityLabel={expression}
          style={{ width: result.width, height: result.height }}
          resizeMode="contain"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <Text selectable style={{ color }}>{source.trim()}</Text>
      )}
    </ScrollView>
  );
}

export function MathMarkdown({ text, foreground }: { text: string; foreground: string }) {
  const parts = splitMathBlocks(text);
  if (!parts.some(({ expression }) => expression)) return <Markdown>{prepareMarkdown(text)}</Markdown>;

  // Links can reference definitions elsewhere in the card, across a display equation.
  const definitions = getReferenceDefinitions(
    parts.filter((part) => !part.expression).map((part) => part.source).join("\n\n"),
  );
  const processed = processColor(foreground);
  const color = typeof processed === "number"
    ? "#" + (processed & 0xffffff).toString(16).padStart(6, "0")
    : "#808080";
  return parts.map(({ expression, source }, index) => expression ? (
    <MathBlock key={index + ":" + color + ":" + expression} expression={expression} source={source} color={color} />
  ) : (
    <Markdown key={index}>{prepareMarkdown(definitions ? `${definitions}\n\n${source}` : source)}</Markdown>
  ));
}
