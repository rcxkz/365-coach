import Link from "next/link";
import { ArrowLeft, Check, Plus, Sparkles, X } from "lucide-react";
import {
  addShoppingLine,
  dropWeekMeal,
  planWeek,
  stockUp,
} from "./actions";
import { PendingButton } from "@/components/pending-button";
import { ShoppingList, type ShoppingAisle } from "@/components/shopping-list";
import { Button } from "@/components/ui/button";
import { UnitMark } from "@/components/unit-mark";
import { customAisles, listAllMeals, listPantry } from "@/data/repos/fuel";
import {
  listShoppingList,
  listWeekPlan,
  weekPlanMealDefinitions,
  type WeekPlanMealRow,
} from "@/data/repos/week-plan";
import { addDaysISO, startOfWeekISO, todayInTimeZone } from "@/domain/dates";
import { filterMealCandidates } from "@/domain/meal-candidates";
import {
  AISLE_LABELS,
  AISLES,
  builtInAisle,
  formatIngredient,
  formatList,
  shelfOrder,
  type MealDefinition,
} from "@/domain/meals";
import {
  DINNER_RANGE,
  deriveShoppingList,
  LUNCH_RANGE,
  pantryDepth,
  scorePoolOverlap,
} from "@/domain/week-plan";

export const dynamic = "force-dynamic";

/**
 * A button here plans the week with the coach — model calls that take tens of
 * seconds. Server actions inherit the page's limit, and the platform
 * default cut planning off part-way (the nightly cron hit the same
 * thing on 31 July), so the ceiling is stated rather than inherited.
 */
export const maxDuration = 300;

export const metadata = { title: "This week" };

const PLANNED_NOTICE: Record<string, string> = {
  ai: "Week planned. The list below is everything it needs that isn't already in.",
  // Says only what's certain: the rules planned it. Whether the coach was
  // missing, out of credit or unreachable isn't knowable from here, and
  // guessing would be the kind of confident wrong answer to avoid.
  rules:
    "Week planned from your rules rather than the coach. The meals stand on their own, and the list below is what they need.",
  error:
    "Planning didn't go through this time — nothing was changed. Worth another try in a minute.",
};

function formatWeek(weekStart: string): string {
  const end = addDaysISO(weekStart, 6);
  const day = (iso: string) => Number(iso.slice(8, 10));
  const month = (iso: string) =>
    new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" }).format(
      new Date(`${iso}T00:00:00Z`),
    );
  return month(weekStart) === month(end)
    ? `${day(weekStart)}–${day(end)} ${month(end)}`
    : `${day(weekStart)} ${month(weekStart)} – ${day(end)} ${month(end)}`;
}

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, index) => from + index);

/** How many dinners and lunch preps — set each time, defaulting to last time. */
function PlanForm({
  dinners,
  lunches,
  label,
  primary,
}: {
  dinners: number;
  lunches: number;
  label: string;
  primary: boolean;
}) {
  const select =
    "h-9 rounded-md border border-input bg-background px-2 text-sm";
  return (
    <form action={planWeek} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
        <select name="dinners" defaultValue={dinners} aria-label="Dinners" className={select}>
          {range(DINNER_RANGE.min, DINNER_RANGE.max).map((n) => (
            <option key={n} value={n}>
              {n} dinners
            </option>
          ))}
        </select>
        <span className="text-muted-foreground">and</span>
        <select name="lunches" defaultValue={lunches} aria-label="Lunch preps" className={select}>
          {range(LUNCH_RANGE.min, LUNCH_RANGE.max).map((n) => (
            <option key={n} value={n}>
              {n === 0 ? "no lunch preps" : n === 1 ? "1 lunch prep" : `${n} lunch preps`}
            </option>
          ))}
        </select>
      </div>
      <PendingButton
        variant={primary ? "default" : "ghost"}
        size={primary ? "default" : "sm"}
        className="w-full"
        pendingLabel="Planning the week… about half a minute"
      >
        {primary && <Sparkles className="h-4 w-4" />}
        {label}
      </PendingButton>
    </form>
  );
}

function PlannedMeal({ row, meal }: { row: WeekPlanMealRow; meal: MealDefinition }) {
  return (
    <li className="flex items-start gap-3 py-4">
      <div className="min-w-0 flex-1">
        <p
          className={
            row.cookedOn
              ? "leading-snug text-muted-foreground line-through"
              : "font-medium leading-snug"
          }
        >
          {meal.name}
        </p>
        <p className="figure mt-0.5 text-xs text-muted-foreground">
          {meal.activeMinutes} min hands-on
          {row.slot === "dinner" && meal.batchFriendly && " · batches into lunch"}
          {row.cookedOn && " · cooked"}
        </p>
        {row.reason && !row.cookedOn && (
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground/75">
            {row.reason}
          </p>
        )}
      </div>
      {!row.cookedOn && (
        <form className="shrink-0 pt-1.5">
          <Button
            formAction={dropWeekMeal.bind(null, row.id)}
            variant="ghost"
            size="sm"
            type="submit"
            aria-label={`Drop ${meal.name} from the week`}
          >
            <X className="h-4 w-4" />
          </Button>
        </form>
      )}
    </li>
  );
}

/**
 * The week's food (Phase 6, reworked in Phase 13): choose how many
 * dinners and lunch preps, see them, and shop from one list grouped by
 * aisle. The list stands on its own — running-low items appear on it
 * even before a week is planned.
 */
export default async function WeekPage({
  searchParams,
}: {
  searchParams: Promise<{ planned?: string; stocked?: string }>;
}) {
  const { planned, stocked } = await searchParams;
  const weekStart = startOfWeekISO(todayInTimeZone());

  const [plan, pool, items, pantry, allMeals, aisles] = await Promise.all([
    listWeekPlan(weekStart),
    weekPlanMealDefinitions(weekStart),
    listShoppingList(weekStart),
    listPantry(),
    listAllMeals(),
    customAisles(),
  ]);
  const mealsById = new Map(allMeals.map((meal) => [meal.id, meal]));
  const dinnerRows = plan.filter((row) => row.slot === "dinner");
  const lunchRows = plan.filter((row) => row.slot === "lunch");

  const overlap = scorePoolOverlap(pool);
  const inTheHouse = pantry.map((item) => item.ingredient);
  const runningLow = new Set(pantry.filter((item) => item.runningLow).map((item) => item.ingredient));
  const derived = deriveShoppingList(pool, inTheHouse);
  const forMeals = new Map(derived.toBuy.map((line) => [line.ingredient, line.forMeals]));

  // W3: the week behaves differently depending on how stocked the
  // kitchen is, so the screen has to say which one happened.
  const depth = pantryDepth(
    filterMealCandidates(allMeals, {
      slot: "dinner",
      today: weekStart,
      pantry: pantry.map((item) => ({ ingredient: item.ingredient })),
      userState: [],
      maxMissingIngredients: Number.MAX_SAFE_INTEGER,
    }),
  );

  const aisleOf = (key: string) => builtInAisle(key) ?? aisles.get(key) ?? "other";
  const listAisles: ShoppingAisle[] = AISLES.map((aisle) => ({
    label: AISLE_LABELS[aisle],
    items: items
      .filter((item) => aisleOf(item.ingredient) === aisle)
      .sort((a, b) => shelfOrder(a.ingredient, aisles) - shelfOrder(b.ingredient, aisles))
      .map((item) => {
        const meals = forMeals.get(item.ingredient)?.filter((name) => name !== "running low");
        return {
          id: item.id,
          label: formatIngredient(item.ingredient),
          status: item.status,
          manual: item.source === "manual",
          note: runningLow.has(item.ingredient)
            ? "running low"
            : meals?.length
              ? `for ${formatList(meals)}`
              : null,
        };
      }),
  }));

  const needed = items.filter((item) => item.status === "needed");
  const settled = items.filter((item) => item.status !== "needed");
  const bought = items.filter((item) => item.status === "bought");

  const notice = planned
    ? (PLANNED_NOTICE[planned] ?? PLANNED_NOTICE.rules)
    : stocked
      ? Number(stocked) > 0
        ? `${stocked} ${Number(stocked) === 1 ? "thing" : "things"} added to the kitchen — tonight's suggestions know about them now.`
        : "Nothing to move across yet — tick off what you picked up first."
      : null;

  const lastDinners = dinnerRows.length || DINNER_RANGE.default;
  const lastLunches = plan.length > 0 ? lunchRows.length : LUNCH_RANGE.default;

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-8">
      <Link
        href="/fuel"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Fuel
      </Link>

      <header className="mt-4 mb-6">
        <p className="eyebrow">This week</p>
        <h1 className="mt-1.5 text-[1.75rem] font-normal leading-none">
          {formatWeek(weekStart)}
        </h1>
        {items.length > 0 && (
          <div className="mt-3 flex flex-col gap-1.5">
            <UnitMark
              filled={settled.length}
              total={items.length}
              tone={needed.length === 0 ? "go" : "neutral"}
              label={`${settled.length} of ${items.length} sorted`}
            />
            <p className="figure text-xs text-muted-foreground">
              {plan.length > 0 && `${overlap.meals} meals · `}
              {needed.length > 0 ? `${needed.length} to buy` : "list cleared"}
              {plan.length > 0 && ` · ${overlap.sharedIngredients} shared`}
            </p>
          </div>
        )}
      </header>

      {notice && (
        <p className="mb-6 rounded-lg bg-secondary p-3 text-sm">{notice}</p>
      )}

      {plan.length === 0 ? (
        <div className="mb-8 rounded-lg border border-dashed p-5 text-center">
          <p className="mb-4 text-sm text-muted-foreground">
            Nothing planned for this week yet. Pick how many dinners and lunch
            preps, and it builds the meals and one list to shop from — around
            what&apos;s already in the kitchen.
          </p>
          <PlanForm dinners={lastDinners} lunches={lastLunches} label="Plan the week" primary />
        </div>
      ) : (
        <>
          <section className="mb-8">
            <h2 className="eyebrow mb-1">Dinners</h2>
            <p className="mb-3 text-xs text-muted-foreground">
              {depth.mode === "stocked"
                ? `Your kitchen could already cook ${depth.readyMeals} of these, so the week was built around what's in.`
                : "Not much recorded in the kitchen, so the week was planned freely and the list covers it."}{" "}
              {dinnerRows.length} for seven nights — cook them in whatever order
              the week allows. The slack is on purpose.
            </p>
            <ul className="flex flex-col divide-y divide-border border-y border-border">
              {dinnerRows.map((row) => {
                const meal = mealsById.get(row.mealId);
                return meal ? <PlannedMeal key={row.id} row={row} meal={meal} /> : null;
              })}
            </ul>
          </section>

          {lunchRows.length > 0 && (
            <section className="mb-8">
              <h2 className="eyebrow mb-1">Lunch preps</h2>
              <p className="mb-3 text-xs text-muted-foreground">
                Make once, eat on a few days. Leftover dinners cover the rest.
              </p>
              <ul className="flex flex-col divide-y divide-border border-y border-border">
                {lunchRows.map((row) => {
                  const meal = mealsById.get(row.mealId);
                  return meal ? <PlannedMeal key={row.id} row={row} meal={meal} /> : null;
                })}
              </ul>
            </section>
          )}
        </>
      )}

      {(plan.length > 0 || items.length > 0) && (
        <section className="mb-8">
          <h2 className="eyebrow mb-1">Shopping list</h2>
          <p className="mb-4 text-xs text-muted-foreground">
            Tap to tick it into the trolley. The cross means you&apos;ve already
            got it.
          </p>

          {items.length > 0 ? (
            <ShoppingList aisles={listAisles} />
          ) : (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              Nothing on the list.
            </p>
          )}

          <form action={addShoppingLine} className="mt-4 flex gap-2">
            <input
              name="ingredient"
              placeholder="Add something else…"
              aria-label="Add to the list"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            />
            <Button type="submit" variant="outline" size="sm">
              <Plus className="h-4 w-4" />
            </Button>
          </form>

          {derived.optional.length > 0 && (
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              <span className="text-foreground">Nice to have: </span>
              {derived.optional.map((line) => formatIngredient(line.ingredient)).join(", ")}
              . None of these stop a meal happening.
            </p>
          )}
        </section>
      )}

      <div className="flex flex-col gap-3">
        {bought.length > 0 && (
          <form>
            <Button formAction={stockUp} className="w-full" type="submit">
              <Check className="h-4 w-4" />
              Got the shop in — add it to the kitchen
            </Button>
          </form>
        )}
        {plan.length > 0 && (
          <PlanForm
            dinners={lastDinners}
            lunches={lastLunches}
            label="Plan the week again"
            primary={false}
          />
        )}
      </div>
    </main>
  );
}
