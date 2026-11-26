import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const resultKind = "hydrogen-result";
export const resultSchema = z.object({ text: z.string() });
export const idSchema = z.uuid();

export const restore = defineRpc({
  name: "restore",
  input: z.object({ agentId: idSchema }),
  output: z.object({ count: z.number().int() }),
});
