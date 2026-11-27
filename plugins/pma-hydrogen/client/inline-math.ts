import { fromMarkdown } from "mdast-util-from-markdown";
import { mathFromMarkdown } from "mdast-util-math";
import { math } from "micromark-extension-math";
import type { Nodes } from "mdast";

export type InlineFormula = { start: number; end: number; expression: string };

const mathOptions = { extensions: [math()], mdastExtensions: [mathFromMarkdown()] };

export function findInlineFormulas(source: string): InlineFormula[] {
  if (!source.includes("$")) return [];
  const result: InlineFormula[] = [];
  function visit(node: Nodes) {
    if (node.type === "inlineMath") {
      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      if (start === undefined || end === undefined) return;
      const original = source.slice(start, end);
      const body = original.replace(/^\$+|\$+$/g, "");
      const expression = node.value.trim();
      if (/\r|\n|^\s|\s$|^`/.test(body) || !expression || expression.length > 4096) return;
      // A dollar immediately introducing the next price is not a math closer.
      if (/^[+-]?(?:\d|\.\d)/.test(body) && /^[+-]?(?:\d|\.\d)/.test(source.slice(end, end + 3))) return;
      result.push({ start, end, expression });
    } else if ("children" in node) {
      node.children.forEach(visit);
    }
  }
  visit(fromMarkdown(source, mathOptions));
  return result;
}

export function replaceInlineFormulas(
  source: string, formulas: InlineFormula[], images: ReadonlyMap<string, string>,
): string {
  let result = "";
  let cursor = 0;
  for (const { start, end, expression } of formulas) {
    const png = images.get(expression);
    if (!png) continue;
    const label = expression.replace(/[\[\]\\]/g, "\\$&");
    result += source.slice(cursor, start) + `![${label}](<data:image/png;base64,${png}>)`;
    cursor = end;
  }
  return result + source.slice(cursor);
}
