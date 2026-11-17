import { and, desc, eq, gte, lte } from "drizzle-orm";
import { getDb } from "../db";
import {
  dailyCheckins,
  type CheckinEnergy,
  type CheckinSleepValue,
  type CheckinSorenessValue,
} from "../schema";

export type DailyCheckin = typeof dailyCheckins.$inferSelect;

/**
 * One row per day. Fields left undefined are preserved on update, so a
 * later partial tap (e.g. adjusting energy alone) never wipes the rest
 * of the morning's check-in.
 */
export async function upsertCheckin(
  date: string,
  input: {
    energy: CheckinEnergy;
    sleep?: CheckinSleepValue | null;
    soreness?: CheckinSorenessValue | null;
    timeAvailableMinutes?: number | null;
    note?: string | null;
  },
): Promise<DailyCheckin> {
  const db = await getDb();
  const [row] = await db
    .insert(dailyCheckins)
    .values({
      date,
      energy: input.energy,
      sleep: input.sleep ?? null,
      soreness: input.soreness ?? null,
      timeAvailableMinutes: input.timeAvailableMinutes ?? null,
      note: input.note ?? null,
    })
    .onConflictDoUpdate({
      target: dailyCheckins.date,
      set: {
        energy: input.energy,
        ...(input.sleep !== undefined ? { sleep: input.sleep } : {}),
        ...(input.soreness !== undefined ? { soreness: input.soreness } : {}),
        ...(input.timeAvailableMinutes !== undefined
          ? { timeAvailableMinutes: input.timeAvailableMinutes }
          : {}),
        ...(input.note !== undefined ? { note: input.note } : {}),
        updatedAt: new Date(),
      },
    })
    .returning();
  return row;
}

export async function getCheckin(date: string): Promise<DailyCheckin | null> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(dailyCheckins)
    .where(eq(dailyCheckins.date, date))
    .limit(1);
  return row ?? null;
}

/** Check-ins between two dates inclusive, newest first (journal timeline). */
export async function listCheckins(from: string, to: string): Promise<DailyCheckin[]> {
  const db = await getDb();
  return db
    .select()
    .from(dailyCheckins)
    .where(and(gte(dailyCheckins.date, from), lte(dailyCheckins.date, to)))
    .orderBy(desc(dailyCheckins.date));
}
