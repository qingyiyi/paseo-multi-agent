import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const wasm = await readFile(require.resolve("@resvg/resvg-wasm/index_bg.wasm"));
const generated = new URL("../server/generated/", import.meta.url);
await mkdir(generated, { recursive: true });
await writeFile(
  new URL("wasm.ts", generated),
  `// Generated from @resvg/resvg-wasm.
export const wasmBase64 = ${JSON.stringify(wasm.toString("base64"))};
`,
);
