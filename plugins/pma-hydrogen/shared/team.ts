import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
import { idSchema, requestSchema } from "./hydrogen";

export const teamCheck = defineRpc({
  name: "team.check",
  input: z.object({ agentId: idSchema }),
  output: z.object({ exists: z.boolean(), toolsEnabled: z.boolean() }),
});

const savedItem = z.object({ requestId: requestSchema, submittedAt: z.number(), title: z.string() });
export type SavedItem = z.output<typeof savedItem>;

export const listSaved = defineRpc({
  name: "team.saved.list",
  input: z.object({ agentId: idSchema, query: z.string().max(120) }),
  output: z.object({ items: z.array(savedItem), matches: z.number().int() }),
});

export const readSaved = defineRpc({
  name: "team.saved.read",
  input: z.object({ agentId: idSchema, requestId: requestSchema }),
  output: z.object({ text: z.string().nullable() }),
});
