import { asc, eq } from "drizzle-orm";
import type { DayActionDraft } from "../../domain/compose-day";
import { getDb } from "../db";
import { todayActions, type ActionStatus } from "../schema";

export type TodayAction = typeof todayActions.$inferSelect;
export type { DayActionDraft };

/**
 * Replaces the day's action list (used by seeding and AI regeneration).
 * Delete + insert runs sequentially because the Neon HTTP driver has no
 * interactive transactions; a crash between the two is recovered by the
 * next regeneration.
 */
export async function replaceDayActions(
  date: string,
  drafts: DayActionDraft[],
): Promise<TodayAction[]> {
  const db = await getDb();
  await db.delete(todayActions).where(eq(todayActions.date, date));
  if (!drafts.length) return [];
  return db
    .insert(todayActions)
    .values(
      drafts.map((draft, index) => ({
        date,
        position: index,
        domain: draft.domain,
        kind: draft.kind,
        title: draft.title,
        detail: draft.detail ?? null,
        rationale: draft.rationale ?? null,
        workoutId: draft.workoutId ?? null,
        mealId: draft.mealId ?? null,
        ...(draft.status ? { status: draft.status } : {}),
      })),
    )
    .returning();
}

export async function getAction(id: number): Promise<TodayAction | null> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(todayActions)
    .where(eq(todayActions.id, id))
    .limit(1);
  return row ?? null;
}

export async function getDayActions(date: string): Promise<TodayAction[]> {
  const db = await getDb();
  return db
    .select()
    .from(todayActions)
    .where(eq(todayActions.date, date))
    .orderBy(asc(todayActions.position));
}

export async function setActionStatus(
  id: number,
  status: ActionStatus,
): Promise<void> {
  const db = await getDb();
  await db
    .update(todayActions)
    .set({ status })
    .where(eq(todayActions.id, id));
}
