import { and, desc, eq, type SQL } from "drizzle-orm";
import { getDb } from "../db";
import {
  memories,
  type LifeDomain,
  type MemoryStatus,
  type MemoryTier,
} from "../schema";

export type Memory = typeof memories.$inferSelect;

export async function addMemory(input: {
  tier: MemoryTier;
  domain?: LifeDomain;
  content: string;
}): Promise<Memory> {
  const db = await getDb();
  const [row] = await db
    .insert(memories)
    .values({
      tier: input.tier,
      domain: input.domain ?? "general",
      content: input.content,
    })
    .returning();
  return row;
}

export async function listMemories(filter?: {
  tier?: MemoryTier;
  domain?: LifeDomain;
  status?: MemoryStatus;
}): Promise<Memory[]> {
  const db = await getDb();
  const conditions: SQL[] = [];
  if (filter?.tier) conditions.push(eq(memories.tier, filter.tier));
  if (filter?.domain) conditions.push(eq(memories.domain, filter.domain));
  if (filter?.status) conditions.push(eq(memories.status, filter.status));
  return db
    .select()
    .from(memories)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(memories.updatedAt));
}

export async function archiveMemory(id: number): Promise<void> {
  const db = await getDb();
  await db
    .update(memories)
    .set({ status: "archived", updatedAt: new Date() })
    .where(eq(memories.id, id));
}

/** Re-verification stamp per playbook doc 09 ("Is the wrist still sore?"). */
export async function confirmMemory(id: number): Promise<void> {
  const db = await getDb();
  await db
    .update(memories)
    .set({ lastConfirmedAt: new Date(), updatedAt: new Date() })
    .where(eq(memories.id, id));
}

/** The user's own correction of what the coach "knows". */
export async function updateMemoryContent(
  id: number,
  content: string,
): Promise<void> {
  const db = await getDb();
  await db
    .update(memories)
    .set({ content, lastConfirmedAt: new Date(), updatedAt: new Date() })
    .where(eq(memories.id, id));
}
