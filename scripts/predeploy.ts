/**
 * Runs before `next build` on Vercel. For a production deploy it applies
 * pending migrations and syncs the code-defined libraries, so a deploy
 * that adds a table can't go live against a database without it — and
 * nobody has to remember `db:migrate`.
 *
 * Production only: preview deploys may share the production database,
 * and a branch's migration must not reach it before the branch merges.
 * Locally it does nothing (PGlite migrates itself; use db:migrate for
 * Neon by hand).
 */
async function main() {
  if (process.env.VERCEL_ENV !== "production" || !process.env.DATABASE_URL) {
    console.log("predeploy: not a production deploy — skipping migrations.");
    return;
  }
  const [{ neon }, { drizzle }, { migrate }, { syncLibraries }] = await Promise.all([
    import("@neondatabase/serverless"),
    import("drizzle-orm/neon-http"),
    import("drizzle-orm/neon-http/migrator"),
    import("../src/data/sync"),
  ]);
  await migrate(drizzle(neon(process.env.DATABASE_URL)), { migrationsFolder: "drizzle" });
  console.log("predeploy: migrations applied.");
  const synced = await syncLibraries();
  console.log("predeploy: libraries synced.", synced);
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error("predeploy failed", error);
    process.exit(1);
  },
);
