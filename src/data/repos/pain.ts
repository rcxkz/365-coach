import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "../db";
import { painFlags } from "../schema";

export type PainFlag = typeof painFlags.$inferSelect;

export async function addPainFlag(input: {
  location: string;
  severity: number;
  aggravatingMovement?: string | null;
  note?: string | null;
}): Promise<PainFlag> {
  if (!Number.isInteger(input.severity) || input.severity < 1 || input.severity > 5) {
    throw new RangeError("Pain severity must be an integer from 1 to 5");
  }
  const db = await getDb();
  const [row] = await db
    .insert(painFlags)
    .values({
      location: input.location,
      severity: input.severity,
      aggravatingMovement: input.aggravatingMovement ?? null,
      note: input.note ?? null,
    })
    .returning();
  return row;
}

/**
 * Check-in pain entry (decision D10: one pain system). Updates the open
 * flag for the location if one exists, otherwise opens a new one —
 * daily check-ins never create duplicate flags for the same area.
 */
export async function upsertOpenPainFlag(input: {
  location: string;
  severity: number;
  note?: string | null;
}): Promise<PainFlag> {
  if (
    !Number.isInteger(input.severity) ||
    input.severity < 1 ||
    input.severity > 5
  ) {
    throw new RangeError("Pain severity must be an integer from 1 to 5");
  }
  const db = await getDb();
  const [existing] = await db
    .select()
    .from(painFlags)
    .where(and(isNull(painFlags.resolvedAt), eq(painFlags.location, input.location)))
    .orderBy(desc(painFlags.createdAt))
    .limit(1);
  if (existing) {
    const [row] = await db
      .update(painFlags)
      .set({
        severity: input.severity,
        ...(input.note !== undefined ? { note: input.note } : {}),
      })
      .where(eq(painFlags.id, existing.id))
      .returning();
    return row;
  }
  return addPainFlag(input);
}

export async function listOpenPainFlags(): Promise<PainFlag[]> {
  const db = await getDb();
  return db
    .select()
    .from(painFlags)
    .where(isNull(painFlags.resolvedAt))
    .orderBy(desc(painFlags.createdAt));
}

export async function resolvePainFlag(id: number): Promise<void> {
  const db = await getDb();
  await db
    .update(painFlags)
    .set({ resolvedAt: new Date() })
    .where(eq(painFlags.id, id));
}
