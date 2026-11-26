import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const resultKind = "hydrogen-result";
export const resultSchema = z.object({ text: z.string() });
export const idSchema = z.uuid();
export const requestSchema = z.string().regex(/^[a-zA-Z0-9_-]{8,80}$/);

export const permissionKind = "hydrogen-permission";
export const permissionSchema = z.object({
  deliveryId: requestSchema,
  permissionId: z.string(),
  title: z.string(),
  detail: z.string().optional(),
  actions: z.array(z.object({
    id: z.string(),
    label: z.string(),
    behavior: z.enum(["allow", "deny"]),
  })),
});

export const statusKind = "hydrogen-status";
export const statusSchema = z.object({
  title: z.string(),
});

export const answerPermission = defineRpc({
  name: "answer-permission",
  input: z.object({
    agentId: idSchema,
    deliveryId: requestSchema,
    permissionId: z.string().min(1),
    actionId: z.string().min(1),
  }),
  output: z.object({ accepted: z.boolean() }),
});

export const restore = defineRpc({
  name: "restore",
  input: z.object({ agentId: idSchema }),
  output: z.object({ count: z.number().int() }),
});
