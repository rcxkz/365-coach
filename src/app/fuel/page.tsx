import Link from "next/link";
import { ArrowLeft, Check, ChevronDown, ChevronRight, Clock, Sparkles, X } from "lucide-react";
import { markCooked, suggestDinner, toggleLunchSorted } from "./actions";
import { Badge } from "@/components/ui/badge";
import { PendingButton } from "@/components/pending-button";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getFuelDay, listAllMeals, listPantry } from "@/data/repos/fuel";
import { USER_MEAL_PREFIX, type MealDefinition } from "@/domain/meals";
import { listWeekPlan, outstandingCount, uncookedWeekMeals } from "@/data/repos/week-plan";
import { addDaysISO, startOfWeekISO, todayInTimeZone } from "@/domain/dates";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * A button here suggests dinner with the coach — model calls that take tens of
 * seconds. Server actions inherit the page's limit, and the platform
 * default cut planning off part-way (the nightly cron hit the same
 * thing on 31 July), so the ceiling is stated rather than inherited.
 */
export const maxDuration = 300;

export const metadata = { title: "Fuel" };


function MealCard({
  meal,
  reason,
  primary,
}: {
  meal: MealDefinition | null;
  reason: string | null;
  primary: boolean;
}) {
  if (!meal) return null;

  return (
    <Card className="py-0">
      <CardContent className="p-4">
        <div className="flex items-baseline justify-between gap-2">
          <p className="font-medium">{meal.name}</p>
          <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {meal.activeMinutes} min hands-on
          </span>
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {meal.description}
        </p>
        {reason && <p className="mt-2 text-sm">{reason}</p>}

        <div className="mt-3 flex flex-wrap gap-1.5">
          {meal.batchFriendly && <Badge variant="secondary">Batches for lunch</Badge>}
          {meal.freezerFriendly && <Badge variant="secondary">Freezes</Badge>}
          <Badge variant="secondary">{meal.totalMinutes} min total</Badge>
        </div>

        {primary && (
          <>
            {/* Folded away: the card is read while hungry, and a
                made-ahead dinner doesn't need the method at all. */}
            {meal.steps.length > 0 && (
              <details className="group mt-3 border-t border-border pt-3">
                <summary className="flex cursor-pointer list-none items-center justify-between text-sm [&::-webkit-details-marker]:hidden">
                  How to make it
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="group-open:hidden">{meal.steps.length} steps</span>
                    <ChevronDown aria-hidden className="h-4 w-4 transition-transform group-open:rotate-180" />
                  </span>
                </summary>
                <ol className="mt-2 flex list-decimal flex-col gap-1.5 pl-4 text-sm text-muted-foreground">
                  {meal.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </details>
            )}
            <div className="mt-4 border-t border-border pt-4">
              <p className="mb-2 text-xs text-muted-foreground">
                Cooked it? One tap teaches it what to suggest next.
              </p>
              <form className="flex gap-2">
                <Button
                  formAction={markCooked.bind(null, meal.id, true)}
                  size="sm"
                  className="flex-1"
                  type="submit"
                >
                  <Check className="h-4 w-4" />
                  Make again
                </Button>
                <Button
                  formAction={markCooked.bind(null, meal.id, false)}
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  type="submit"
                >
                  <X className="h-4 w-4" />
                  Not again
                </Button>
              </form>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function HubLink({ href, title, line }: { href: string; title: string; line: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 py-3.5 transition-colors hover:bg-foreground/[0.02]"
    >
      <div className="min-w-0 flex-1">
        <p className="font-medium leading-snug">{title}</p>
        <p className="figure mt-0.5 text-xs text-muted-foreground">{line}</p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}

export default async function FuelPage({
  searchParams,
}: {
  searchParams: Promise<{ cooked?: string }>;
}) {
  const { cooked } = await searchParams;
  const date = todayInTimeZone();
  const weekStart = startOfWeekISO(date);
  const nextWeek = addDaysISO(weekStart, 7);
  const [day, pantry, weekLeft, lunchesLeft, toBuy, allMeals, thisPlan, nextPlan] = await Promise.all([
    getFuelDay(date),
    listPantry(),
    uncookedWeekMeals(weekStart, "dinner"),
    uncookedWeekMeals(weekStart, "lunch"),
    outstandingCount(weekStart),
    listAllMeals(),
    listWeekPlan(weekStart),
    listWeekPlan(nextWeek),
  ]);
  const weekPlanned = thisPlan.length > 0;
  // From Friday, next week is the one worth planning.
  const lateInWeek = date >= addDaysISO(weekStart, 4);
  const weekLine = weekPlanned
    ? [
        `${weekLeft.length} ${weekLeft.length === 1 ? "dinner" : "dinners"} to cook`,
        lunchesLeft.length > 0 ? `${lunchesLeft.length} lunch ${lunchesLeft.length === 1 ? "prep" : "preps"}` : null,
        toBuy > 0 ? `${toBuy} to buy` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "Not planned yet. Pick how many meals and a prep day, and it lays the week out.";
  const range = (start: string) => {
    const fmt = (iso: string, withMonth: boolean) =>
      new Intl.DateTimeFormat("en-GB", { day: "numeric", ...(withMonth ? { month: "short" } : {}), timeZone: "UTC" }).format(
        new Date(`${iso}T12:00:00Z`),
      );
    return `${fmt(start, false)}–${fmt(addDaysISO(start, 6), true)}`;
  };
  const mine = allMeals.filter((meal) => meal.id.startsWith(USER_MEAL_PREFIX));
  const lowCount = pantry.filter((item) => item.runningLow).length;
  const mealsById = new Map(allMeals.map((meal) => [meal.id, meal]));

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-8">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Today
      </Link>

      <header className="mt-4 mb-6">
        <h1 className="text-[1.75rem] font-normal leading-none">Fuel</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          One decision for tonight, tomorrow&apos;s lunch handled before
          you&apos;re hungry, and one shop a week.
        </p>
      </header>

      {cooked && (
        <p className="mb-4 rounded-lg bg-secondary p-3 text-sm">
          Noted — that shapes what gets suggested next.
        </p>
      )}

      {/* The week leads (Phase 18): planning and the shop are what this
          tab is for, so they're the first thing on it, not a link at the
          bottom. */}
      <section className="mb-8 border border-foreground p-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="eyebrow">Your week</h2>
          <span className="figure text-xs text-muted-foreground">{range(weekStart)}</span>
        </div>
        <p className="mt-2 text-sm">{weekLine}</p>
        <div className="mt-4 flex flex-col gap-2">
          {weekPlanned ? (
            <>
              <Link href="/fuel/week" className={cn(buttonVariants(), "h-11 w-full")}>
                Open the week
              </Link>
              <div className="grid grid-cols-2 gap-2">
                <Link href="/fuel/week#list" className={cn(buttonVariants({ variant: "outline" }), "h-10")}>
                  Shopping list
                </Link>
                <Link
                  href="/fuel/week?week=next"
                  className={cn(buttonVariants({ variant: lateInWeek && nextPlan.length === 0 ? "default" : "outline" }), "h-10")}
                >
                  {nextPlan.length > 0 ? "Next week" : "Plan next week"}
                </Link>
              </div>
            </>
          ) : (
            <>
              <Link href={lateInWeek ? "/fuel/week?week=next" : "/fuel/week"} className={cn(buttonVariants(), "h-11 w-full")}>
                <Sparkles className="h-4 w-4" />
                {lateInWeek ? "Plan next week" : "Plan the week"}
              </Link>
              {lateInWeek && (
                <Link href="/fuel/week" className="text-center text-xs text-muted-foreground underline-offset-4 hover:underline">
                  Or plan the rest of this week
                </Link>
              )}
            </>
          )}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="eyebrow mb-3">
          Tonight
        </h2>
        {day?.dinnerMealId ? (
          <div className="flex flex-col gap-3">
            <MealCard
              meal={mealsById.get(day.dinnerMealId) ?? null}
              reason={day.dinnerReason}
              primary
            />
            {day.alternativeMealId && (
              <>
                <p className="text-xs text-muted-foreground">
                  If the evening goes sideways:
                </p>
                <MealCard
                  meal={mealsById.get(day.alternativeMealId) ?? null}
                  reason={day.alternativeReason}
                  primary={false}
                />
              </>
            )}
            <form>
              <PendingButton pendingLabel="Thinking about dinner…"
                formAction={suggestDinner}
                variant="ghost"
                size="sm"
                className="w-full"
                type="submit"
              >
                Suggest something else
              </PendingButton>
            </form>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-6 text-center">
            <p className="text-sm text-muted-foreground">
              {pantry.length === 0
                ? "Nothing recorded in the kitchen yet — tell it what's in (below) and it'll work with what you actually have."
                : "No suggestion for tonight yet."}
            </p>
            <form className="mt-4">
              <PendingButton pendingLabel="Thinking about dinner…" formAction={suggestDinner} className="w-full" type="submit">
                <Sparkles className="h-4 w-4" />
                Suggest dinner
              </PendingButton>
            </form>
          </div>
        )}
      </section>

      <section className="mb-8">
        <h2 className="eyebrow mb-3">
          Tomorrow&apos;s lunch
        </h2>
        <form>
          {day?.lunchSorted ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <p className="text-sm">
                <Check className="mr-1 inline h-4 w-4 text-foreground" />
                Sorted — that&apos;s the delivery decision already made.
              </p>
              <Button
                formAction={toggleLunchSorted.bind(null, false)}
                variant="ghost"
                size="sm"
                type="submit"
              >
                Undo
              </Button>
            </div>
          ) : (
            <Button
              formAction={toggleLunchSorted.bind(null, true)}
              variant="outline"
              className="w-full"
              type="submit"
            >
              Lunch is sorted
            </Button>
          )}
        </form>
      </section>

      <section>
        <h2 className="eyebrow mb-1">Kitchen and meals</h2>
        <div className="flex flex-col divide-y divide-border border-y border-border">
          <HubLink
            href="/fuel/kitchen"
            title="What's in"
            line={
              pantry.length > 0
                ? `${pantry.length} in${lowCount > 0 ? ` · ${lowCount} running low` : ""}`
                : "Tell it what's in, so the week plans around it"
            }
          />
          <HubLink
            href="/fuel/meals"
            title="Your meals"
            line={
              mine.length > 0
                ? `${mine.length} of your own, plus ${allMeals.length - mine.length} built in`
                : "Add the meals you actually cook"
            }
          />
        </div>
      </section>
    </main>
  );
}
