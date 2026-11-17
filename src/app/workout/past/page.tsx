import Link from "next/link";
import { ArrowLeft, Check, ChevronRight, Undo2 } from "lucide-react";
import { markTrained, unmarkTrained } from "./actions";
import { Button } from "@/components/ui/button";
import { listRecentWorkouts } from "@/data/repos/workouts";
import { todayInTimeZone, USER_TIME_ZONE } from "@/domain/dates";

export const dynamic = "force-dynamic";

export const metadata = { title: "Earlier sessions" };

function formatDay(date: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(`${date}T00:00:00Z`));
}

export default async function PastSessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ logged?: string }>;
}) {
  const { logged } = await searchParams;
  const today = todayInTimeZone();
  const sessions = await listRecentWorkouts(today, 14);
  const outstanding = sessions.filter(
    (session) => session.status === "planned",
  ).length;

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-8">
      <Link
        href="/workout"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Workout
      </Link>

      <header className="mt-4 mb-6">
        <p className="eyebrow">Earlier sessions</p>
        <h1 className="mt-1.5 text-[1.75rem] font-semibold leading-none tracking-tight">
          Trained but not logged?
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {outstanding > 0
            ? `${outstanding} planned ${outstanding === 1 ? "session is" : "sessions are"} still open. One tap records that it happened; open it if you want the sets too.`
            : "Nothing outstanding — every planned session here is accounted for."}
        </p>
      </header>

      {logged && (
        <p className="mb-6 rounded-lg bg-secondary p-3 text-sm">
          Recorded. It counts as a session; the review will still say no sets
          were logged for it, because that&apos;s the truth.
        </p>
      )}

      {sessions.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No sessions before today yet.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border border-y border-border">
          {sessions.map((session) => {
            const done = session.status === "completed";
            const skipped = session.status === "skipped";
            return (
              <li key={session.id} className="flex items-start gap-3 py-4">
                <Link
                  href={`/workout?date=${session.date}`}
                  className="min-w-0 flex-1"
                  aria-label={`Open ${session.title} on ${formatDay(session.date)}`}
                >
                  <p className="figure text-[0.625rem] uppercase tracking-[0.16em] text-muted-foreground">
                    {formatDay(session.date)}
                  </p>
                  <p
                    className={
                      done || skipped
                        ? "mt-0.5 leading-snug text-muted-foreground"
                        : "mt-0.5 font-medium leading-snug"
                    }
                  >
                    {session.title}
                  </p>
                  <p className="figure mt-0.5 text-xs text-muted-foreground">
                    {skipped
                      ? "skipped"
                      : session.setsLogged > 0
                        ? `${session.setsLogged} sets logged`
                        : done
                          ? "trained · no sets recorded"
                          : "nothing logged"}
                  </p>
                </Link>

                <form className="shrink-0 pt-3">
                  {done ? (
                    <Button
                      formAction={unmarkTrained.bind(null, session.date)}
                      variant="ghost"
                      size="sm"
                      type="submit"
                      aria-label={`Undo — ${formatDay(session.date)} wasn't trained`}
                    >
                      <Undo2 className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button
                      formAction={markTrained.bind(null, session.date)}
                      variant="outline"
                      size="sm"
                      type="submit"
                      aria-label={`Mark ${formatDay(session.date)} as trained`}
                    >
                      <Check className="h-4 w-4" />
                      Trained
                    </Button>
                  )}
                </form>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-6 flex items-center gap-1 text-xs text-muted-foreground">
        <ChevronRight className="h-3 w-3" />
        Tap a session to open it and log the sets.
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        Days with nothing planned aren&apos;t listed — there&apos;s no session
        to record against them. Times are {USER_TIME_ZONE.split("/")[1]}.
      </p>
    </main>
  );
}
