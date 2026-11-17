import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { getDb } from "./db";

const EXPECTED_TABLES = [
  "exercises",
  "exercise_user_state",
  "memories",
  "workouts",
  "workout_exercises",
  "set_logs",
  "pain_flags",
  "daily_checkins",
  "today_actions",
];

describe("getDb", () => {
  it("connects and has all tables migrated", async () => {
    const db = await getDb();
    const result = await db.execute(
      sql`select table_name from information_schema.tables where table_schema = 'public'`,
    );
    const names = (result.rows as { table_name: string }[]).map(
      (row) => row.table_name,
    );
    for (const table of EXPECTED_TABLES) {
      expect(names).toContain(table);
    }
  });
});
