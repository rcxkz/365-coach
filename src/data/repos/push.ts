import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { pushSubscriptions, sentReminders } from "../schema";

export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;

/** Re-subscribing the same browser refreshes its keys, never duplicates. */
export async function savePushSubscription(input: {
  endpoint: string;
  p256dh: string;
  auth: string;
}): Promise<void> {
  const db = await getDb();
  await db
    .insert(pushSubscriptions)
    .values(input)
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { p256dh: input.p256dh, auth: input.auth },
    });
}

export async function deletePushSubscription(endpoint: string): Promise<void> {
  const db = await getDb();
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
}

export async function listPushSubscriptions(): Promise<PushSubscriptionRow[]> {
  const db = await getDb();
  return db.select().from(pushSubscriptions);
}

/**
 * Claims today's reminder of this kind. True for exactly one caller per
 * kind and date — the unique index decides, so concurrent runs are safe.
 */
export async function claimReminder(kind: string, date: string): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .insert(sentReminders)
    .values({ kind, date })
    .onConflictDoNothing()
    .returning({ id: sentReminders.id });
  return rows.length > 0;
}
