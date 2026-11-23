import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { appLock } from "../schema";

/** The stored passcode hash, or null while the copy is unclaimed. */
export async function getLockHash(): Promise<string | null> {
  const db = await getDb();
  const [row] = await db.select().from(appLock).where(eq(appLock.id, 1)).limit(1);
  return row?.passcodeHash ?? null;
}

/**
 * Claims the copy with a first passcode. Only one claim can win: false
 * means someone set a passcode first.
 */
export async function claimLock(passcodeHash: string): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .insert(appLock)
    .values({ id: 1, passcodeHash })
    .onConflictDoNothing()
    .returning({ id: appLock.id });
  return rows.length === 1;
}

export async function replaceLockHash(passcodeHash: string): Promise<void> {
  const db = await getDb();
  await db.update(appLock).set({ passcodeHash, updatedAt: new Date() }).where(eq(appLock.id, 1));
}
