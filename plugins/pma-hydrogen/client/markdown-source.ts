import { fromMarkdown } from "mdast-util-from-markdown";
import type { Nodes } from "mdast";

const ambiguousEmphasis = /(?<=\p{Script=Han})(\*{1,3})(?!\*)(?=[\p{P}\p{S}])|(?<=[\p{P}\p{S}])(?<!\*)\*{1,3}(?=\p{Script=Han})/gu;
const htmlCode = /<code\b[^>]*>[\s\S]*?<\/code\s*>/gi;
const hairSpace = "\u200a";

function visit(node: Nodes, inspect: (node: Nodes) => void) {
  inspect(node);
  if ("children" in node) node.children.forEach((child) => visit(child, inspect));
}

export function getReferenceDefinitions(source: string): string {
  if (!/^ {0,3}\[[^\]\r\n]+\]:/m.test(source)) return "";
  return fromMarkdown(source).children.flatMap((node) =>
    node.type === "definition" && node.position
      ? [source.slice(node.position.start.offset, node.position.end.offset)]
      : [],
  ).join("\n\n");
}

/** Allow emphasis beside Han text when punctuation inside the markers blocks CommonMark flanking. */
export function prepareMarkdown(source: string): string {
  const candidates = [...source.matchAll(ambiguousEmphasis)];
  if (!candidates.length) return source;

  // Use text spans so Markdown syntax in code, link targets and raw markup stays literal.
  const ranges: { start: number; end: number }[] = [];
  visit(fromMarkdown(source), (node) => {
    if (node.type !== "text") return;
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (start !== undefined && end !== undefined) ranges.push({ start, end });
  });
  // Paseo also accepts HTML code spans and converts them to literal Markdown code.
  const htmlCodeRanges = [...source.matchAll(htmlCode)];
  const insertions: { offset: number; before: boolean }[] = [];
  let rangeIndex = 0;
  let htmlCodeIndex = 0;
  for (const { 0: marker, 1: opening, index } of candidates) {
    const end = index + marker.length;
    while (ranges[rangeIndex]?.end <= index) rangeIndex += 1;
    const range = ranges[rangeIndex];
    if (!range || range.start > index || range.end < end) continue;

    let html = htmlCodeRanges[htmlCodeIndex];
    while (html && html.index + html[0].length <= index) html = htmlCodeRanges[++htmlCodeIndex];
    if (html && html.index <= index) continue;

    const before = opening !== undefined;
    insertions.push({ offset: before ? index : end, before });
  }
  if (!insertions.length) return source;

  let trial = "";
  let cursor = 0;
  for (const { offset } of insertions) {
    trial += source.slice(cursor, offset) + hairSpace;
    cursor = offset;
  }
  trial += source.slice(cursor);

  // Only keep inserted boundaries that actually produce emphasis in the trial parse.
  const starts = new Set<number>();
  const ends = new Set<number>();
  visit(fromMarkdown(trial), (node) => {
    if (node.type !== "strong" && node.type !== "emphasis") return;
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (start !== undefined) starts.add(start);
    if (end !== undefined) ends.add(end);
  });
  let result = "";
  cursor = 0;
  for (const [index, { offset, before }] of insertions.entries()) {
    if (!(before ? starts.has(offset + index + 1) : ends.has(offset + index))) continue;
    result += source.slice(cursor, offset) + hairSpace;
    cursor = offset;
  }
  return result + source.slice(cursor);
}
