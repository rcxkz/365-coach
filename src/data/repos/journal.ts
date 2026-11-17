import { and, desc, eq, gte, lte } from "drizzle-orm";
import type {
  DigestionState,
  JournalEntry,
  StressLevel,
} from "../../domain/journal";
import type { CheckinEnergyLevel, CheckinSoreness } from "../../domain/readiness";
import { getDb } from "../db";
import { journalEntries } from "../schema";

export type JournalRow = typeof journalEntries.$inferSelect;

export interface NewJournalEntry {
  date: string;
  mood?: number | null;
  stress?: StressLevel | null;
  energy?: CheckinEnergyLevel | null;
  soreness?: CheckinSoreness | null;
  digestion?: DigestionState | null;
  custom?: Record<string, number | boolean>;
}

export async function addJournalEntry(input: NewJournalEntry): Promise<JournalRow> {
  if (input.mood != null && (!Number.isInteger(input.mood) || input.mood < 1 || input.mood > 5)) {
    throw new RangeError("Mood must be an integer from 1 to 5");
  }
  const db = await getDb();
  const [row] = await db
    .insert(journalEntries)
    .values({
      date: input.date,
      mood: input.mood ?? null,
      stress: input.stress ?? null,
      energy: input.energy ?? null,
      soreness: input.soreness ?? null,
      digestion: input.digestion ?? null,
      custom: input.custom ?? {},
    })
    .returning();
  return row;
}

/** Entries between two dates inclusive, newest first. */
export async function listJournalEntries(from: string, to: string): Promise<JournalRow[]> {
  const db = await getDb();
  return db
    .select()
    .from(journalEntries)
    .where(and(gte(journalEntries.date, from), lte(journalEntries.date, to)))
    .orderBy(desc(journalEntries.createdAt));
}

export async function deleteJournalEntry(id: number): Promise<void> {
  const db = await getDb();
  await db.delete(journalEntries).where(eq(journalEntries.id, id));
}

/** Shape the domain works with. */
export function toJournalEntry(row: JournalRow): JournalEntry {
  return {
    date: row.date,
    at: row.createdAt.toISOString(),
    mood: row.mood,
    stress: row.stress,
    energy: row.energy,
    soreness: row.soreness,
    digestion: row.digestion,
    custom: (row.custom ?? {}) as Record<string, number | boolean>,
  };
}
