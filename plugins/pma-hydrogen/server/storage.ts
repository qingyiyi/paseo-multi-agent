import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { z } from "zod";
import { idSchema, requestSchema } from "../shared/hydrogen";

export const rootDirectory = path.join(process.env.PASEO_HOME || path.join(homedir(), ".paseo"), "pma-hydrogen");
const recordSchema = z.object({
  workerId: idSchema,
  messageId: idSchema,
  submittedAt: z.number(),
  text: z.string().optional(),
  draft: z.string().optional(),
  failed: z.boolean().optional(),
});
export type Delivery = z.infer<typeof recordSchema>;

function agentDirectory(agentId: string) {
  return path.join(rootDirectory, "results", idSchema.parse(agentId));
}

function recordPath(agentId: string, requestId: string) {
  return path.join(agentDirectory(agentId), requestSchema.parse(requestId) + ".json");
}

export async function readDelivery(agentId: string, requestId: string): Promise<Delivery | null> {
  const file = await readFile(recordPath(agentId, requestId), "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  return file === null ? null : recordSchema.parse(JSON.parse(file));
}

export async function readDeliveries(agentId: string) {
  const names = await readdir(agentDirectory(agentId)).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  const deliveries = await Promise.all(names.filter((name) => name.endsWith(".json")).map(async (name) => {
    const requestId = name.slice(0, -5);
    return { requestId, record: await readDelivery(agentId, requestId) };
  }));
  return deliveries.sort((a, b) => (a.record?.submittedAt ?? 0) - (b.record?.submittedAt ?? 0));
}

export async function writeDelivery(agentId: string, requestId: string, record: Delivery) {
  const destination = recordPath(agentId, requestId);
  const draft = destination + "." + randomUUID() + ".tmp";
  await mkdir(agentDirectory(agentId), { recursive: true, mode: 0o700 });
  try {
    await writeFile(draft, JSON.stringify(record), { mode: 0o600, flag: "wx" });
    await rename(draft, destination);
  } finally {
    await rm(draft, { force: true });
  }
}
