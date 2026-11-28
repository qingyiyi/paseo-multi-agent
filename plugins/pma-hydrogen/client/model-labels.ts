/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

const opus = { color: "#991B1B", backgroundColor: "#FEE2E2" };
const sourceColors = {
  "[Opus]": opus,
  "[Opus 5.5]": opus,
  "[Neon]": { color: "#854D0E", backgroundColor: "#FEF3C7" },
  "[Astra]": { color: "#6B21A8", backgroundColor: "#F3E8FF" },
  "[Terra]": { color: "#115E59", backgroundColor: "#CCFBF1" },
};
export const modelColors = {
  "hydrogen:": { color: "#1E3A8A", backgroundColor: "#DBEAFE" },
  ...sourceColors,
};
export const modelLabelSource = `(?:${Object.keys(sourceColors).map((label) =>
  label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
).join("|")})`;

const surfaceSelector = ':is([data-testid="assistant-message"], [data-testid="pma-model-markdown"]) .enrm-text';
const ignoredSelector = 'pre, a, [role="link"], .katex';
const codeAttribute = "data-pma-inline-model-label";
const labelPattern = new RegExp(modelLabelSource, "g");
const observerKey = Symbol.for("pma-hydrogen.model-label-colors");

export function installModelLabelColors(): () => void {
  if (typeof document === "undefined" || !document.body) return () => {};
  const host = document as Document & { [observerKey]?: { users: number; stop: () => void } };
  const state = host[observerKey] ??= { users: 0, stop: observeModelLabels(host) };
  state.users += 1;
  return () => {
    state.users -= 1;
    if (state.users === 0) {
      state.stop();
      delete host[observerKey];
    }
  };
}

function observeModelLabels(host: Document): () => void {
  const registry = typeof Highlight === "function" ? CSS.highlights : undefined;
  const highlights = new Map<string, Highlight>();
  const style = host.createElement("style");
  style.textContent = Object.entries(sourceColors).map(([label, colors], index) => {
    const name = `pma-model-label-${index}`;
    if (registry) {
      const highlight = new Highlight();
      registry.set(name, highlight);
      highlights.set(label, highlight);
    }
    return `::highlight(${name}) { color: ${colors.color}; background-color: ${colors.backgroundColor}; }
      code[${codeAttribute}="${label}"] { color: ${colors.color} !important; background-color: ${colors.backgroundColor} !important; }`;
  }).join("\n");
  host.head.appendChild(style);

  const pending = new Set<Element>();
  const displayed = new Map<Element, { highlight: Highlight; range: Range }[]>();
  let frame = 0;

  function paint(surface: Element) {
    for (const { highlight, range } of displayed.get(surface) ?? []) highlight.delete(range);
    displayed.delete(surface);
    if (!surface.isConnected) return;

    surface.querySelectorAll("code").forEach((code) => {
      const label = code.textContent ?? "";
      if (Object.hasOwn(sourceColors, label) && !code.closest(ignoredSelector)) {
        code.setAttribute(codeAttribute, label);
      } else if (code.hasAttribute(codeAttribute)) {
        code.removeAttribute(codeAttribute);
      }
    });

    // Paint plain labels in their existing text nodes so React, selection and Markdown keep ownership.
    if (highlights.size === 0) return;
    const ranges: { highlight: Highlight; range: Range }[] = [];
    const walker = host.createTreeWalker(surface, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const value = node.nodeValue ?? "";
      if (!value.includes("[") || node.parentElement?.closest(`${ignoredSelector}, code`)) continue;
      for (const match of value.matchAll(labelPattern)) {
        const highlight = highlights.get(match[0]);
        if (!highlight) continue;
        const range = host.createRange();
        range.setStart(node, match.index);
        range.setEnd(node, match.index + match[0].length);
        highlight.add(range);
        ranges.push({ highlight, range });
      }
    }
    if (ranges.length) displayed.set(surface, ranges);
  }

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      const target = record.target;
      const surface = (target instanceof Element ? target : target.parentElement)?.closest(surfaceSelector);
      if (surface) pending.add(surface);
      record.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) return;
        if (node.matches(surfaceSelector)) pending.add(node);
        node.querySelectorAll(surfaceSelector).forEach((added) => pending.add(added));
      });
    }
    for (const surface of displayed.keys()) if (!surface.isConnected) pending.add(surface);
    if (pending.size && !frame) frame = requestAnimationFrame(() => {
      frame = 0;
      pending.forEach(paint);
      pending.clear();
    });
  });
  observer.observe(host.body, { childList: true, characterData: true, subtree: true });
  host.querySelectorAll(surfaceSelector).forEach(paint);

  return () => {
    observer.disconnect();
    if (frame) cancelAnimationFrame(frame);
    Object.keys(sourceColors).forEach((_, index) => registry?.delete(`pma-model-label-${index}`));
    host.querySelectorAll(`code[${codeAttribute}]`).forEach((code) => code.removeAttribute(codeAttribute));
    style.remove();
  };
}
