import { desc, eq, isNull } from "drizzle-orm";
import type { PauseReason } from "../../domain/comeback";
import { getDb } from "../db";
import { trainingPauses } from "../schema";

export type TrainingPause = typeof trainingPauses.$inferSelect;

export async function getOpenPause(): Promise<TrainingPause | null> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(trainingPauses)
    .where(isNull(trainingPauses.endedOn))
    .orderBy(desc(trainingPauses.startedOn))
    .limit(1);
  return row ?? null;
}

/** Newest first. A handful is plenty: only the latest return matters. */
export async function listPauses(limit = 10): Promise<TrainingPause[]> {
  const db = await getDb();
  return db
    .select()
    .from(trainingPauses)
    .orderBy(desc(trainingPauses.startedOn), desc(trainingPauses.id))
    .limit(limit);
}

/** Idempotent: an already-open pause is returned as it is. */
export async function startPause(
  reason: PauseReason,
  startedOn: string,
): Promise<TrainingPause> {
  const open = await getOpenPause();
  if (open) return open;
  const db = await getDb();
  const [row] = await db
    .insert(trainingPauses)
    .values({ reason, startedOn })
    .returning();
  return row;
}

/** Ends the open pause, if any. Never ends before it started. */
export async function endPause(endedOn: string): Promise<TrainingPause | null> {
  const open = await getOpenPause();
  if (!open) return null;
  const db = await getDb();
  const [row] = await db
    .update(trainingPauses)
    .set({ endedOn: endedOn < open.startedOn ? open.startedOn : endedOn })
    .where(eq(trainingPauses.id, open.id))
    .returning();
  return row;
}
