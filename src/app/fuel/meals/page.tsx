import Link from "next/link";
import { ArrowLeft, ChevronRight, Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { MEAL_LIBRARY } from "@/data/library/meals";
import { listMealUserState, listUserMeals } from "@/data/repos/fuel";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata = { title: "Meals" };

/**
 * The meals the planners choose from (Phase 13): the user's own first,
 * then the built-in library — any of which can be copied and tweaked.
 */
export default async function MealsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; removed?: string }>;
}) {
  const { saved, removed } = await searchParams;
  const [mine, states] = await Promise.all([listUserMeals(), listMealUserState()]);
  const notAgain = new Set(states.filter((s) => s.makeAgain === false).map((s) => s.mealId));
  const notice = saved
    ? `Saved “${saved}”. It's in the mix for tonight and the week plan.`
    : removed
      ? "Removed. It won't be suggested again."
      : null;

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-8">
      <Link
        href="/fuel"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Fuel
      </Link>
      <header className="mt-4 mb-6 flex items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Meals</p>
          <h1 className="mt-1.5 text-[1.75rem] font-normal leading-none">
            What gets cooked
          </h1>
        </div>
        <Link href="/fuel/meals/new" className={cn(buttonVariants({ size: "sm" }))}>
          <Plus className="h-4 w-4" /> Add
        </Link>
      </header>

      {notice && <p className="mb-6 rounded-lg bg-secondary p-3 text-sm">{notice}</p>}

      <section className="mb-8">
        <h2 className="eyebrow mb-3">Yours</h2>
        {mine.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            None yet. Add the meals you actually cook — describe one in a
            sentence and the coach fills in the rest.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border border-y border-border">
            {mine.map((meal) => (
              <li key={meal.id}>
                <Link href={`/fuel/meals/${meal.id}`} className="flex items-center justify-between gap-3 py-3">
                  <span>
                    <span className="block text-sm font-medium">{meal.name}</span>
                    <span className="figure text-xs text-muted-foreground">
                      {meal.activeMinutes} min hands-on · {meal.slots.join(" & ")}
                      {meal.batchFriendly ? " · leftovers" : ""}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="eyebrow mb-1">Built in</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Copy one to make it your own version.
        </p>
        <ul className="flex flex-col divide-y divide-border border-y border-border">
          {MEAL_LIBRARY.map((meal) => (
            <li key={meal.id} className="flex items-center justify-between gap-3 py-2.5">
              <span className="min-w-0">
                <span className="block truncate text-sm">{meal.name}</span>
                <span className="figure text-xs text-muted-foreground">
                  {meal.activeMinutes} min hands-on
                  {notAgain.has(meal.id) ? " · not again" : ""}
                </span>
              </span>
              <Link
                href={`/fuel/meals/new?from=${meal.id}`}
                className="shrink-0 text-xs text-muted-foreground underline-offset-4 hover:underline"
              >
                Copy &amp; tweak
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
