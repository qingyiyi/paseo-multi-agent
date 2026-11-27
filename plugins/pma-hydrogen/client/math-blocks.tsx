import { useRpc } from "@getpaseo/plugin/client";
import { Markdown } from "@getpaseo/plugin/client/ui";
import { useEffect, useMemo, useState } from "react";
import { Image, ScrollView, Text, processColor } from "react-native";
import { renderMath } from "../shared/render-math";
import type { RenderOutput } from "../shared/render-math";
import { getReferenceDefinitions, prepareMarkdown } from "./markdown-source";
import { findInlineFormulas, replaceInlineFormulas } from "./inline-math";

type Part =
  | { source: string; expression?: undefined }
  | { source: string; expression: string; firstLine: number; lastLine: number };

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
    parts.push({ expression, source: lines.slice(first, index + 1).join(""), firstLine: first, lastLine: index });
    markdownStart = index + 1;
  }
  const remaining = lines.slice(markdownStart).join("");
  if (remaining.trim()) parts.push({ source: remaining });
  return parts;
}

export function canUseMathMarkdown(text: string, hasLabels: boolean): boolean {
  const otherMath = /(?:\$`|\\\(|\\\[|^ {0,3}(?:`{3,}|~{3,})[ \t]*(?:math|latex|tex)\b)/im;
  if (!text.includes("$") && !otherMath.test(text)) return hasLabels;
  const parts = splitMathBlocks(text);
  const prose = parts.filter(({ expression }) => !expression);
  // Leave math syntax this renderer does not recognise to the existing math plugin.
  if (prose.some(({ source }) => otherMath.test(source))) return false;
  return hasLabels || parts.length !== prose.length || prose.some(({ source }) => findInlineFormulas(source).length > 0);
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

function InlineMathMarkdown({ text, color }: { text: string; color: string }) {
  const render = useRpc(renderMath);
  const source = useMemo(() => prepareMarkdown(text), [text]);
  const formulas = useMemo(() => findInlineFormulas(source), [source]);
  const [result, setResult] = useState<{ source: string; color: string; markdown: string }>();

  useEffect(() => {
    if (!formulas.length) return;
    let mounted = true;
    const expressions = [...new Set(formulas.map(({ expression }) => expression))];
    void Promise.allSettled(expressions.map((expression) => render({ expression, color, display: false })))
      .then((renders) => {
        if (!mounted) return;
        const images = new Map<string, string>();
        renders.forEach((entry, index) => {
          if (entry.status === "fulfilled" && entry.value.ok) images.set(expressions[index], entry.value.png);
        });
        setResult({ source, color, markdown: replaceInlineFormulas(source, formulas, images) });
      });
    return () => { mounted = false; };
  }, [source, formulas, color, render]);

  return <Markdown>{result?.source === source && result.color === color ? result.markdown : source}</Markdown>;
}

export function MathMarkdown({ text, foreground }: { text: string; foreground: string }) {
  const processed = processColor(foreground);
  const color = typeof processed === "number"
    ? "#" + (processed & 0xffffff).toString(16).padStart(6, "0")
    : "#808080";
  const parts = splitMathBlocks(text);
  if (!parts.some(({ expression }) => expression)) return <InlineMathMarkdown text={text} color={color} />;

  // Links can reference definitions elsewhere in the card, across a display equation.
  const definitions = getReferenceDefinitions(
    parts.filter((part) => !part.expression).map((part) => part.source).join("\n\n"),
  );
  return parts.map(({ expression, source }, index) => expression ? (
    <MathBlock key={index + ":" + color + ":" + expression} expression={expression} source={source} color={color} />
  ) : (
    <InlineMathMarkdown key={index} text={definitions ? `${definitions}\n\n${source}` : source} color={color} />
  ));
}
