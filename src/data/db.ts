import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "./schema";

/**
 * Database handle, driver-agnostic:
 * - `DATABASE_URL` set  -> Neon serverless (production / linked dev)
 * - otherwise           -> embedded PGlite at `.data/pg` (local dev),
 *                          in-memory under Vitest.
 *
 * PGlite auto-migrates on first use. Neon is migrated at deploy time
 * (`db:migrate`) so cold starts never race concurrent migrations.
 *
 * Server-side only — never import from client components.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = PgDatabase<any, typeof schema>;

let dbPromise: Promise<Db> | null = null;

async function createDb(): Promise<Db> {
  if (process.env.DATABASE_URL) {
    const [{ neon }, { drizzle }] = await Promise.all([
      import("@neondatabase/serverless"),
      import("drizzle-orm/neon-http"),
    ]);
    return drizzle(neon(process.env.DATABASE_URL), { schema });
  }

  // On Vercel the embedded database can't run (read-only, serverless).
  // Say what's missing instead of crashing somewhere inside PGlite — the
  // first thing anyone deploying their own copy hits if they skip a step.
  if (process.env.VERCEL) {
    throw new Error(
      "No database: DATABASE_URL is not set. In Vercel, open Storage → Create → Neon Postgres, connect it to this project, then redeploy (the build creates the tables).",
    );
  }

  const [{ PGlite }, { drizzle }, { migrate }] = await Promise.all([
    import("@electric-sql/pglite"),
    import("drizzle-orm/pglite"),
    import("drizzle-orm/pglite/migrator"),
  ]);
  let client;
  if (process.env.VITEST) {
    client = new PGlite();
  } else {
    // PGlite's node fs does a non-recursive mkdir; the parent must exist.
    const { mkdirSync } = await import("node:fs");
    mkdirSync(".data/pg", { recursive: true });
    client = new PGlite(".data/pg");
  }
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "drizzle" });
  return db;
}

export function getDb(): Promise<Db> {
  if (!dbPromise) {
    dbPromise = createDb();
  }
  return dbPromise;
}
