import type { SetupProblem } from "@/lib/setup-status";

const STEPS: Record<SetupProblem, { title: string; body: string }> = {
  no_database: {
    title: "Connect a database",
    body: "In your Vercel project, open Storage → Create Database → Neon (the free plan is plenty) and connect it to this project. Then open Deployments → the latest one → Redeploy. The redeploy creates the tables.",
  },
  no_tables: {
    title: "Create the tables",
    body: "The database is connected, but this deployment was built before it was. In Vercel, open Deployments → the latest one → Redeploy. The build creates the tables.",
  },
  no_passcode: {
    title: "Choose a passcode",
    body: "In Vercel, open Settings → Environment Variables and add APP_PASSCODE: a passphrase you'll remember, not a short PIN. Then redeploy. Only someone with the passcode can open the app.",
  },
};

/**
 * Shown in place of the app while a fresh deployment is missing a
 * piece. Says exactly what to do, in order, and why (doc 10).
 */
export function FinishSetup({ problems }: { problems: SetupProblem[] }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-12">
      <div>
        <p className="eyebrow">Almost there</p>
        <h1 className="mt-2 text-[1.75rem] font-normal leading-none">Finish setting up</h1>
        <p className="mt-3 text-muted-foreground">
          This copy is deployed. {problems.length === 1 ? "One step is" : `${problems.length} steps are`} left
          before it can plan your first day.
        </p>
      </div>
      <ol className="flex flex-col divide-y divide-border border-y border-border">
        {problems.map((problem, index) => (
          <li key={problem} className="flex gap-4 py-4">
            <span className="figure text-sm text-highlight">{index + 1}</span>
            <div>
              <p className="font-medium">{STEPS[problem].title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{STEPS[problem].body}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="text-sm text-muted-foreground">
        When that&apos;s done, reload this page. Nothing else needs setting up: the AI coach, the
        morning planning and reminders are all optional extras, explained in the README.
      </p>
    </main>
  );
}
