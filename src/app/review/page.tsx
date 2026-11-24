import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  ChevronRight,
  Minus,
  Sparkles,
  TrendingDown,
} from "lucide-react";
import { runWeeklyReview } from "./actions";
import { PendingButton } from "@/components/pending-button";
import { Card, CardContent } from "@/components/ui/card";
import { getWeeklyReview, listWeeklyReviews } from "@/data/repos/reviews";
import { outstandingCount, uncookedWeekMeals } from "@/data/repos/week-plan";
import { addDaysISO, startOfWeekISO, todayInTimeZone } from "@/domain/dates";
import type { ProgressionCall } from "@/domain/week-review";

export const dynamic = "force-dynamic";

/**
 * A button here writes the review with the coach — model calls that take tens of
 * seconds. Server actions inherit the page's limit, and the platform
 * default cut planning off part-way (the nightly cron hit the same
 * thing on 31 July), so the ceiling is stated rather than inherited.
 */
export const maxDuration = 300;

export const metadata = { title: "Weekly review" };

const CALL_META: Record<
  ProgressionCall,
  { label: string; icon: typeof ArrowUpRight; className: string }
> = {
  progress: {
    label: "Step up",
    icon: ArrowUpRight,
    className: "text-foreground",
  },
  hold: { label: "Repeat", icon: Minus, className: "text-muted-foreground" },
  ease: {
    label: "Ease off",
    icon: TrendingDown,
    className: "text-signal-ease",
  },
};

const GROUP_REASON: Record<ProgressionCall, string | null> = {
  progress: "Every set hit the target, so each is ready for a small step up.",
  hold: "Some sets came up short, so repeat before adding anything.",
  ease: null,
};

function formatRange(start: string, end: string): string {
  const fmt = (iso: string) =>
    new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(
      new Date(`${iso}T12:00:00Z`),
    );
  return `${fmt(start)} – ${fmt(end)}`;
}

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { week } = await searchParams;
  const today = todayInTimeZone();
  const lastWeekStart = startOfWeekISO(addDaysISO(today, -7));
  const targetWeek = week ?? lastWeekStart;
  const thisWeek = startOfWeekISO(today);

  const [review, history, weekLeft, toBuy] = await Promise.all([
    getWeeklyReview(targetWeek),
    listWeeklyReviews(6),
    uncookedWeekMeals(thisWeek, "dinner"),
    outstandingCount(thisWeek),
  ]);

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-8">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Today
      </Link>

      <header className="mt-4 mb-6">
        <h1 className="text-[1.75rem] font-normal leading-none">Weekly review</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {review
            ? formatRange(review.weekStart, review.weekEnd)
            : formatRange(targetWeek, addDaysISO(targetWeek, 6))}
          {" · "}
          the deeper adjustments happen here, not day to day.
        </p>
      </header>

      {!review ? (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <p className="text-sm text-muted-foreground">
            No review for this week yet.
          </p>
          <form className="mt-4">
            <PendingButton pendingLabel="Reviewing the week…"
              formAction={runWeeklyReview.bind(null, targetWeek)}
              className="w-full"
              type="submit"
            >
              <Sparkles className="h-4 w-4" />
              Review this week
            </PendingButton>
          </form>
        </div>
      ) : (
        <>
          <p className="mb-6 text-sm leading-relaxed">{review.narrative}</p>

          <div className="mb-6 flex gap-3 text-sm">
            <Card className="flex-1 py-0">
              <CardContent className="p-3 text-center">
                <p className="figure text-2xl font-medium">
                  {review.summary.sessionsCompleted}
                </p>
                <p className="text-xs text-muted-foreground">sessions</p>
              </CardContent>
            </Card>
            <Card className="flex-1 py-0">
              <CardContent className="p-3 text-center">
                <p className="figure text-2xl font-medium">
                  {review.summary.setsLogged}
                </p>
                <p className="text-xs text-muted-foreground">sets logged</p>
              </CardContent>
            </Card>
          </div>

          {review.summary.progressions.length > 0 && (
            <section className="mb-6">
              <h2 className="eyebrow mb-3">
                Next week
              </h2>
              {/* Grouped by the call, with the usual reason said once: a
                  reason under every movement read as a wall of text. */}
              <div className="flex flex-col gap-5">
                {(["ease", "progress", "hold"] as const).map((call) => {
                  const group = review.summary.progressions.filter((p) => p.call === call);
                  if (group.length === 0) return null;
                  const meta = CALL_META[call];
                  const Icon = meta.icon;
                  // Step-ups and repeats share one reason, near enough; an
                  // ease-off is rarer and specific, so it keeps its own.
                  const usual = GROUP_REASON[call];
                  return (
                    <div key={call}>
                      <p className={`flex items-center gap-2 text-sm font-medium ${meta.className}`}>
                        <Icon className="h-4 w-4 shrink-0" />
                        {meta.label} · {group.length}
                      </p>
                      {usual && <p className="mt-0.5 pl-6 text-xs text-muted-foreground">{usual}</p>}
                      <ul className="mt-2 flex flex-col gap-1.5 pl-6">
                        {group.map((progression) => (
                          <li key={progression.libraryExerciseId} className="text-sm">
                            {progression.name}
                            {!usual && (
                              <span className="block text-xs text-muted-foreground">
                                {progression.reason}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {review.summary.wins.length > 0 && (
            <section className="mb-6">
              <h2 className="eyebrow mb-3">
                Worth noting
              </h2>
              <ul className="flex flex-col gap-1">
                {review.summary.wins.map((win) => (
                  <li key={win} className="text-sm text-muted-foreground">
                    {win}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {review.summary.feelings && review.summary.feelings.length > 0 && (
            <section className="mb-6">
              <h2 className="eyebrow mb-3">How you felt</h2>
              <ul className="flex flex-col gap-1">
                {review.summary.feelings.map((line) => (
                  <li key={line} className="text-sm">
                    {line}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {review.summary.watchouts.length > 0 && (
            <section className="mb-6">
              <h2 className="eyebrow mb-3">
                Keep an eye on
              </h2>
              <ul className="flex flex-col gap-1">
                {review.summary.watchouts.map((watchout) => (
                  <li key={watchout} className="text-sm text-muted-foreground">
                    {watchout}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <form>
            <PendingButton pendingLabel="Reviewing the week…"
              formAction={runWeeklyReview.bind(null, review.weekStart)}
              variant="outline"
              size="sm"
              className="w-full"
              type="submit"
            >
              Rebuild this review
            </PendingButton>
          </form>
        </>
      )}

      {/* Reviewing last week is the moment the next one gets planned —
          the only place in the app that mentions the shop, and it never
          nags (G10). */}
      <section className="mt-8">
        <h2 className="eyebrow mb-3">The week ahead</h2>
        <Link
          href="/fuel/week"
          className="flex items-center gap-3 border-y border-border py-4 transition-colors hover:bg-foreground/[0.02]"
        >
          <div className="min-w-0 flex-1">
            <p className="font-medium leading-snug">
              {weekLeft.length > 0
                ? `${weekLeft.length} ${weekLeft.length === 1 ? "dinner" : "dinners"} still to cook`
                : "Plan this week's dinners"}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {weekLeft.length > 0
                ? toBuy > 0
                  ? `${toBuy} still to pick up.`
                  : "Everything for them is in."
                : "Five dinners and one list, in a single pass."}
            </p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Link>
      </section>

      {history.length > 1 && (
        <section className="mt-8">
          <h2 className="eyebrow mb-3">
            Earlier weeks
          </h2>
          <ul className="flex flex-col gap-1">
            {history
              .filter((entry) => entry.weekStart !== targetWeek)
              .map((entry) => (
                <li key={entry.weekStart}>
                  <Link
                    href={`/review?week=${entry.weekStart}`}
                    className="text-sm text-muted-foreground underline-offset-4 hover:underline"
                  >
                    {formatRange(entry.weekStart, entry.weekEnd)} ·{" "}
                    {entry.summary.sessionsCompleted} sessions
                  </Link>
                </li>
              ))}
          </ul>
        </section>
      )}
    </main>
  );
}
