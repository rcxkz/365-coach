import { getTableName, is, sql } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { getDb } from "./db";
import * as schema from "./schema";

/**
 * Empties every table — the public demo's nightly reset (Phase 16).
 *
 * Two independent guards, because this erases everything: DEMO_MODE must
 * be on, and no passcode may be set. Every real deployment has a
 * passcode; the demo has none. Either missing, and this refuses.
 */
export async function resetAllData(): Promise<void> {
  if (process.env.DEMO_MODE !== "1" || process.env.APP_PASSCODE?.trim()) {
    throw new Error("resetAllData refused: only the public demo (DEMO_MODE=1, no passcode) may reset.");
  }
  const tables = (Object.values(schema) as unknown[])
    .filter((value): value is PgTable => is(value, PgTable))
    .map((table) => `"${getTableName(table)}"`);
  const db = await getDb();
  await db.execute(sql.raw(`TRUNCATE TABLE ${tables.join(", ")} RESTART IDENTITY CASCADE`));
}
