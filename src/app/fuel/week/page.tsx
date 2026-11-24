import Link from "next/link";
import { ArrowLeft, Check, Plus, Sparkles, X } from "lucide-react";
import {
  addShoppingLine,
  dropWeekMeal,
  makeList,
  planWeek,
  stockUp,
} from "./actions";
import { PendingButton } from "@/components/pending-button";
import { ShoppingList, type ShoppingAisle } from "@/components/shopping-list";
import { Button } from "@/components/ui/button";
import { UnitMark } from "@/components/unit-mark";
import { customAisles, listAllMeals, listPantry } from "@/data/repos/fuel";
import {
  getWeekMeta,
  listIsStale,
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
  BREAKFAST_RANGE,
  DINNER_RANGE,
  deriveShoppingList,
  LUNCH_RANGE,
  pantryDepth,
  scorePoolOverlap,
} from "@/domain/week-plan";
import { SLOT_PLURAL } from "@/domain/prep-day";
import { defaultPrepDay, needsFreezing, prepDayOptions, prepSession, weekDays } from "@/domain/week-prep";

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
  ai: "Week planned. Look it over, swap anything out, then make your shopping list.",
  // Says only what's certain: the rules planned it. Whether the coach was
  // missing, out of credit or unreachable isn't knowable from here, and
  // guessing would be the kind of confident wrong answer to avoid.
  rules:
    "Week planned from your rules rather than the coach. Look it over, drop anything you don't fancy, then make your shopping list.",
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

const dayFormat = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
/** "Sun 29 Nov". */
const dayLabel = (iso: string) => dayFormat.format(new Date(`${iso}T12:00:00Z`)).replace(",", "");
/** "Sunday". */
const weekday = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));

/** "Mon–Wed", "Thu", for the days a batch covers. */
function daySpan(days: string[]): string {
  if (days.length === 0) return "";
  const short = (iso: string) => weekday(iso).slice(0, 3);
  return days.length === 1 ? short(days[0]) : `${short(days[0])}–${short(days[days.length - 1])}`;
}

const SLOT_LABEL = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner" } as const;
const SLOT_ORDER = ["breakfast", "lunch", "dinner"] as const;

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, index) => from + index);

/** The week's shape and prep day — set each time, defaulting to last time. */
function PlanForm({
  week,
  dinners,
  lunches,
  breakfasts,
  prepOptions,
  prepOn,
  weekStart,
  label,
  primary,
}: {
  week: string;
  dinners: number;
  lunches: number;
  breakfasts: number;
  prepOptions: string[];
  prepOn: string;
  weekStart: string;
  label: string;
  primary: boolean;
}) {
  const select = "h-11 w-full border border-input bg-background px-2 text-sm";
  const field = "flex flex-col gap-1 text-xs text-muted-foreground";
  return (
    <form action={planWeek} className="flex flex-col gap-3 text-left">
      <input type="hidden" name="week" value={week} />
      <div className="grid grid-cols-3 gap-2">
        <label className={field}>
          Breakfasts
          <select name="breakfasts" defaultValue={breakfasts} className={select}>
            {range(BREAKFAST_RANGE.min, BREAKFAST_RANGE.max).map((n) => (
              <option key={n} value={n}>
                {n === 0 ? "None" : n === 1 ? "1 kind" : `${n} kinds`}
              </option>
            ))}
          </select>
        </label>
        <label className={field}>
          Lunches
          <select name="lunches" defaultValue={lunches} className={select}>
            {range(LUNCH_RANGE.min, LUNCH_RANGE.max).map((n) => (
              <option key={n} value={n}>
                {n === 0 ? "None" : n === 1 ? "1 prep" : `${n} preps`}
              </option>
            ))}
          </select>
        </label>
        <label className={field}>
          Dinners
          <select name="dinners" defaultValue={dinners} className={select}>
            {range(DINNER_RANGE.min, DINNER_RANGE.max).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className={field}>
        Prep day: when you&apos;ll cook the make-ahead meals in one go
        <select name="prepOn" defaultValue={prepOn} className={select}>
          {prepOptions.map((day) => (
            <option key={day} value={day}>
              {day < weekStart ? `${dayLabel(day)} (the day before)` : dayLabel(day)}
            </option>
          ))}
        </select>
      </label>
      <PendingButton
        variant={primary ? "default" : "outline"}
        className="w-full"
        pendingLabel="Planning the week… about half a minute"
      >
        {primary && <Sparkles className="h-4 w-4" />}
        {label}
      </PendingButton>
    </form>
  );
}

function PlannedMeal({ row, meal, week }: { row: WeekPlanMealRow; meal: MealDefinition; week: string }) {
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
          {row.slot === "breakfast" && (meal.batchFriendly ? " · makes ahead" : " · quick")}
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
            formAction={dropWeekMeal.bind(null, row.mealId, week)}
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
 * The week's food (Phase 6; Phase 13; week prep in Phase 17): choose how
 * many breakfasts, lunches and dinners and a prep day, see the week day
 * by day with what's prepped and what's cooked on the night, and make
 * the shopping list when you're happy with it.
 */
export default async function WeekPage({
  searchParams,
}: {
  searchParams: Promise<{ planned?: string; stocked?: string; week?: string; list?: string }>;
}) {
  const { planned, stocked, week, list } = await searchParams;
  const today = todayInTimeZone();
  const thisWeek = startOfWeekISO(today);
  const which = week === "next" ? "next" : "this";
  const weekStart = which === "next" ? addDaysISO(thisWeek, 7) : thisWeek;

  const [plan, pool, items, pantry, allMeals, aisles, meta] = await Promise.all([
    listWeekPlan(weekStart),
    weekPlanMealDefinitions(weekStart),
    listShoppingList(weekStart),
    listPantry(),
    listAllMeals(),
    customAisles(),
    getWeekMeta(weekStart),
  ]);
  const mealsById = new Map(allMeals.map((meal) => [meal.id, meal]));
  const firstRowPerMeal = (slot: string) => {
    const seen = new Set<string>();
    return plan.filter((row) => row.slot === slot && !seen.has(row.mealId) && seen.add(row.mealId));
  };
  const breakfastRows = firstRowPerMeal("breakfast");
  const lunchRows = firstRowPerMeal("lunch");
  const dinnerRows = firstRowPerMeal("dinner");

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

  // The list builds when asked. A week planned before that existed (no
  // meta) already has its list.
  const listMade = !meta || Boolean(meta.listBuiltAt);
  const stale = listIsStale(meta);

  const notice = planned
    ? (PLANNED_NOTICE[planned] ?? PLANNED_NOTICE.rules)
    : list === "made"
      ? "List made. It's grouped by aisle in walking order: tap things off as they go in the trolley."
      : stocked
        ? Number(stocked) > 0
          ? `${stocked} ${Number(stocked) === 1 ? "thing" : "things"} added to the kitchen — tonight's suggestions know about them now.`
          : "Nothing to move across yet — tick off what you picked up first."
        : null;

  const prepOptions = prepDayOptions(weekStart, today);
  const prepOn = meta?.prepOn ?? null;
  const formDefaults = {
    week: which,
    weekStart,
    dinners: meta?.dinners ?? (dinnerRows.length || DINNER_RANGE.default),
    lunches: meta?.lunches ?? (plan.length > 0 ? lunchRows.length : LUNCH_RANGE.default),
    breakfasts: meta?.breakfasts ?? BREAKFAST_RANGE.default,
    prepOptions,
    prepOn: prepOn && prepOptions.includes(prepOn) ? prepOn : defaultPrepDay(weekStart, today),
  };

  // The prep session: what's made in one go, and what each covers.
  const sessionRows = prepOn ? plan.filter((row) => row.makeOn === prepOn) : [];
  const sessionMeals = sessionRows
    .map((row) => mealsById.get(row.mealId))
    .filter((meal): meal is MealDefinition => Boolean(meal));
  const session = prepSession([...new Map(sessionMeals.map((m) => [m.id, m])).values()]);
  const coversFor = (mealId: string) =>
    sessionRows
      .filter((row) => row.mealId === mealId)
      .map((row) => `${SLOT_PLURAL[row.slot] ?? row.slot} ${daySpan(row.eatDays ?? [])}`)
      .join(", ");
  const dayPlanned = plan.some((row) => (row.eatDays ?? []).length > 0);

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-8">
      <Link
        href="/fuel"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Fuel
      </Link>

      <header className="mt-4 mb-6">
        <nav aria-label="Which week" className="mb-3 flex gap-2 font-mono text-[0.6875rem] font-bold uppercase tracking-[0.14em]">
          {(["this", "next"] as const).map((w) => (
            <Link
              key={w}
              href={w === "next" ? "/fuel/week?week=next" : "/fuel/week"}
              aria-current={which === w ? "page" : undefined}
              className={
                which === w
                  ? "border border-primary bg-primary px-3 py-2 text-primary-foreground"
                  : "border border-input px-3 py-2 text-muted-foreground hover:text-foreground"
              }
            >
              {w === "this" ? "This week" : "Next week"}
            </Link>
          ))}
        </nav>
        <h1 className="mt-1.5 text-[1.75rem] font-normal leading-none">{formatWeek(weekStart)}</h1>
        {items.length > 0 && listMade && (
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

      {notice && <p className="mb-6 bg-secondary p-3 text-sm">{notice}</p>}

      {plan.length === 0 ? (
        <div className="mb-8 border border-dashed p-5">
          <p className="mb-4 text-sm text-muted-foreground">
            Nothing planned for {which === "next" ? "next" : "this"} week yet. Choose how many of each
            and a prep day. It lays the week out day by day, preps what keeps, and leaves the rest
            to cook on the night. Then you make the shopping list when you&apos;re happy with it.
          </p>
          <PlanForm {...formDefaults} label="Plan the week" primary />
        </div>
      ) : (
        <>
          {sessionMeals.length > 0 && prepOn && (
            <section id="prep" className="mb-8 border border-foreground p-4">
              <p className="eyebrow">Prep session</p>
              <h2 className="mt-1 text-lg font-medium">
                {dayLabel(prepOn)} · about {session.minutes} min
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Longest cooks first, so the oven works while you chop the rest. Portion into
                containers as each one cools.
              </p>
              <ol className="mt-3 flex flex-col divide-y divide-dotted divide-border border-y border-border">
                {session.order.map((meal, index) => (
                  <li key={meal.id} className="flex gap-3 py-2.5 text-sm">
                    <span className="figure text-highlight">{index + 1}</span>
                    <span>
                      <span className="font-medium">{meal.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {meal.activeMinutes} min hands-on, {meal.totalMinutes} min total · {coversFor(meal.id)}
                        {sessionRows.some(
                          (row) => row.mealId === meal.id && needsFreezing(prepOn, row.eatDays ?? []),
                        )
                          ? " · freeze what's for later in the week"
                          : ""}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {dayPlanned && (
            <section className="mb-8">
              <h2 className="eyebrow mb-3">Day by day</h2>
              <ul className="flex flex-col divide-y divide-border border-y border-border">
                {weekDays(weekStart).map((day) => {
                  const eaten = plan
                    .filter((row) => (row.eatDays ?? []).includes(day))
                    .sort((a, b) => SLOT_ORDER.indexOf(a.slot as never) - SLOT_ORDER.indexOf(b.slot as never));
                  const makeAhead = plan.filter((row) => row.makeOn === day && row.makeOn !== prepOn);
                  if (eaten.length === 0 && makeAhead.length === 0 && day !== prepOn) return null;
                  return (
                    <li key={day} className="py-4">
                      <p className="font-mono text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                        {dayLabel(day)}
                        {day === today && <span className="text-highlight"> · today</span>}
                      </p>
                      <ul className="mt-2 flex flex-col gap-2 text-sm leading-snug">
                        {eaten.map((row) => {
                          const meal = mealsById.get(row.mealId);
                          if (!meal) return null;
                          const how =
                            row.makeOn === prepOn
                              ? "prepped"
                              : row.makeOn
                                ? `made ${weekday(row.makeOn)}`
                                : row.slot === "dinner"
                                  ? "cook tonight"
                                  : "make on the day";
                          return (
                            <li key={`${row.id}-${day}`} className="flex justify-between gap-3">
                              <span>
                                <span className="text-muted-foreground">{SLOT_LABEL[row.slot as keyof typeof SLOT_LABEL]}:</span>{" "}
                                {meal.name}
                              </span>
                              <span className="shrink-0 font-mono text-[0.625rem] uppercase tracking-[0.12em] text-muted-foreground">
                                {how}
                              </span>
                            </li>
                          );
                        })}
                        {makeAhead.map((row) => {
                          const meal = mealsById.get(row.mealId);
                          return meal ? (
                            <li key={`make-${row.id}`} className="flex gap-2 text-xs text-muted-foreground">
                              <span aria-hidden className="text-highlight">+</span>
                              <span>
                                Tonight, also make {meal.name.toLowerCase()} for {SLOT_PLURAL[row.slot] ?? row.slot}{" "}
                                {daySpan(row.eatDays ?? [])}.
                              </span>
                            </li>
                          ) : null;
                        })}
                      </ul>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <section className="mb-8">
            <h2 className="eyebrow mb-1">The meals</h2>
            <p className="mb-3 text-xs text-muted-foreground">
              {depth.mode === "stocked"
                ? `Your kitchen could already cook ${depth.readyMeals} of the dinners, so the week was built around what's in.`
                : "Not much recorded in the kitchen, so the week was planned freely."}{" "}
              Drop anything you don&apos;t fancy, then make the list.
            </p>
            {[
              ["Breakfasts", breakfastRows],
              ["Lunch preps", lunchRows],
              ["Dinners", dinnerRows],
            ].map(([title, rows]) =>
              (rows as WeekPlanMealRow[]).length > 0 ? (
                <div key={title as string} className="mt-5">
                  <p className="mb-1 text-sm font-medium">{title as string}</p>
                  <ul className="flex flex-col divide-y divide-border border-y border-border">
                    {(rows as WeekPlanMealRow[]).map((row) => {
                      const meal = mealsById.get(row.mealId);
                      return meal ? <PlannedMeal key={row.id} row={row} meal={meal} week={which} /> : null;
                    })}
                  </ul>
                </div>
              ) : null,
            )}
          </section>
        </>
      )}

      {(plan.length > 0 || items.length > 0) && (
      <section id="list" className="mb-8 scroll-mt-6">
        <h2 className="eyebrow mb-1">Shopping list</h2>
        {plan.length > 0 && !listMade ? (
          <div className="border border-dashed p-4">
            <p className="mb-3 text-sm text-muted-foreground">
              Your list builds when you ask, so you can change the week first. It covers everything
              the meals need that isn&apos;t already in the kitchen.
            </p>
            <form action={makeList}>
              <input type="hidden" name="week" value={which} />
              <PendingButton className="w-full" pendingLabel="Making your list…">
                Make my list
              </PendingButton>
            </form>
          </div>
        ) : (
          <>
            {stale && (
              <div className="mb-4 border border-signal-ease p-3">
                <p className="text-sm">The week changed since this list was made.</p>
                <form action={makeList} className="mt-2">
                  <input type="hidden" name="week" value={which} />
                  <PendingButton variant="outline" size="sm" pendingLabel="Updating…">
                    Update my list
                  </PendingButton>
                </form>
              </div>
            )}
            <p className="mb-4 text-xs text-muted-foreground">
              Tap to tick it into the trolley. The cross means you&apos;ve already got it.
            </p>
          </>
        )}

        {items.length > 0 ? (
          <div className="mt-4">
            <ShoppingList aisles={listAisles} />
          </div>
        ) : (
          listMade && (
            <p className="border border-dashed p-4 text-sm text-muted-foreground">Nothing on the list.</p>
          )
        )}

        <form action={addShoppingLine} className="mt-4 flex gap-2">
          <input type="hidden" name="week" value={which} />
          <input
            name="ingredient"
            placeholder="Add something else…"
            aria-label="Add to the list"
            className="h-11 w-full border border-input bg-background px-3 text-sm"
          />
          <Button type="submit" variant="outline" className="h-11">
            <Plus className="h-4 w-4" />
          </Button>
        </form>

        {listMade && derived.optional.length > 0 && (
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            <span className="text-foreground">Nice to have: </span>
            {derived.optional.map((line) => formatIngredient(line.ingredient)).join(", ")}
            . None of these stop a meal happening.
          </p>
        )}
        {bought.length > 0 && (
          <form action={stockUp} className="mt-6">
            <input type="hidden" name="week" value={which} />
            <Button className="w-full" type="submit">
              <Check className="h-4 w-4" />
              Got the shop in — add it to the kitchen
            </Button>
          </form>
        )}
      </section>
      )}

      {plan.length > 0 && (
        <section className="border-t border-border pt-6">
          <h2 className="eyebrow mb-1">Change the plan</h2>
          <p className="mb-4 text-xs text-muted-foreground">
            A different mix or prep day. Anything already cooked stays.
          </p>
          <PlanForm {...formDefaults} label="Plan the week again" primary={false} />
        </section>
      )}
    </main>
  );
}
