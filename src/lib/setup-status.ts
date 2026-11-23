import { authConfig, inAppPasscode } from "@/lib/auth";
import { isDemo } from "@/lib/demo";

/**
 * What a fresh deployment still needs before the app can run. Checked
 * before anything touches the database, so a copy that skipped a step
 * gets a page saying what to do instead of an error.
 */
export type SetupProblem = "no_database" | "no_tables" | "no_passcode";

export function configProblems(): SetupProblem[] {
  const problems: SetupProblem[] = [];
  // Locally the embedded database needs nothing; on Vercel it can't run.
  if (process.env.VERCEL && !process.env.DATABASE_URL?.trim()) problems.push("no_database");
  // Without APP_PASSCODE the owner chooses one in the app, which needs a
  // database to keep it in, so a missing database is the one step to show.
  if (
    process.env.NODE_ENV === "production" &&
    !isDemo() &&
    !authConfig() &&
    !inAppPasscode() &&
    !problems.includes("no_database")
  ) {
    problems.push("no_passcode");
  }
  return problems;
}

/** A database that's connected but was never given its tables. */
export function isMissingTables(error: unknown): boolean {
  for (let current: unknown = error; current; current = (current as { cause?: unknown }).cause) {
    const { code, message } = current as { code?: string; message?: string };
    if (code === "42P01" || /relation .* does not exist/i.test(message ?? "")) return true;
  }
  return false;
}
