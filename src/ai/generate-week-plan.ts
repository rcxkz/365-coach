import { z } from "zod";
import { BEHAVIOURAL_CORE } from "./behavioural-core";
import { getProfile } from "@/data/repos/profile";
import { getAi } from "./client";
import { fuelVoice } from "./voices/fuel";
import {
  listMealsForDiet,
  listMealUserState,
  pantryForPlanning,
} from "@/data/repos/fuel";
import {
  listWeekPlan,
  refreshShoppingList,
  saveWeekMeta,
  saveWeekPlan,
  type PlanSlot,
  type WeekPlanMealRow,
} from "@/data/repos/week-plan";
import {
  filterMealCandidates,
  type MealCandidate,
} from "@/domain/meal-candidates";
import { formatIngredient, type MealDefinition } from "@/domain/meals";
import { addDaysISO, todayInTimeZone } from "@/domain/dates";
import {
  assignWeek,
  defaultPrepDay,
  MAX_HANDS_ON_MINUTES,
  mealsNeeded,
  normaliseStyle,
  planDays,
  QUICK_MINUTES,
  type WeekStyle,
} from "@/domain/week-prep";
import {
  pantryDepth,
  pickWeekPool,
  scorePoolOverlap,
} from "@/domain/week-plan";

/**
 * The week's shop, planned once (Phase 6 design).
 *
 * Same shape as everything else here: deterministic gates produce the
 * candidates, the AI picks among them by id, and `pickWeekPool` both
 * completes the week and enforces the rules the AI can't be trusted to
 * hold — variety and enough batch cooking to leave lunches. If the AI is
 * unavailable, out of credit, or returns nonsense, the greedy plans the
 * whole week on its own and the user never sees a blank screen.
 */

const WeekChoice = z.object({
  meals: z
    .array(
      z.object({
        mealId: z
          .string()
          .describe("Meal id, copied exactly from the options — never invented"),
        reason: z
          .string()
          .describe("One short sentence — why this meal is in the week"),
      }),
    )
    .describe("The week's dinners, as many as asked for"),
});

export type WeekPlanResult = {
  weekStart: string;
  meals: WeekPlanMealRow[];
  mode: "ai" | "rules";
};

function describe(candidate: MealCandidate): string {
  const meal = candidate.meal;
  const bits = [
    `${meal.id} — ${meal.name}`,
    `(${meal.activeMinutes} min hands-on, ${meal.proteinFocus})`,
    `[needs: ${meal.coreIngredients.map(formatIngredient).join(", ")}]`,
  ];
  if (candidate.missingIngredients.length === 0) {
    bits.push("[all in already]");
  }
  if (candidate.usesUpSoon.length > 0) {
    bits.push(
      `[uses up ${candidate.usesUpSoon.map(formatIngredient).join(", ")}]`,
    );
  }
  if (candidate.favourite) bits.push("[user said make again]");
  if (meal.batchFriendly) bits.push("[batches into lunch]");
  return bits.join(" ");
}

function buildPrompt(input: {
  weekStart: string;
  candidates: MealCandidate[];
  pantry: string[];
  stocked: boolean;
  dinners: number;
  alsoBuying: string[];
}): string {
  return [
    `Plan ${input.dinners} different dinners for the week beginning ${input.weekStart}, one for each time dinner gets cooked.`,
    input.alsoBuying.length > 0
      ? `The week's breakfasts already use: ${input.alsoBuying.map(formatIngredient).join(", ")}. Dinners that use those too make the shop smaller.`
      : "",
    input.pantry.length > 0
      ? `Already in the house: ${input.pantry.map(formatIngredient).join(", ")}.`
      : "Nothing is recorded in the house, so assume everything is being bought.",
    input.stocked
      ? "The kitchen is well stocked, so build the week around what's already in and keep the shop as small as you can — food bought and not used is the waste that matters here."
      : "",
    `Options — use the id exactly as written, and never invent a meal:\n${input.candidates
      .map((candidate) => `  ${describe(candidate)}`)
      .join("\n")}`,
    [
      "Choose a set that hangs together as one small shop: meals sharing ingredients beat five unrelated ones, because the leftover half-bags are what end up in the bin.",
      "No more than two meals with the same protein.",
      "Favour anything they've said they'd make again, and anything that uses up what's already in.",
      "Each reason is one short sentence in plain language — what makes this meal worth its place in the week.",
    ].join(" "),
  ].join("\n\n");
}

/**
 * The rules-mode reason for a meal's place in the week.
 *
 * Most of the candidate notes are wrong for this screen. "Needs
 * potatoes and salad" says nothing when the whole week is being bought,
 * and the hands-on and batches-into-lunch notes just repeat the meta
 * line the row already shows — printing both makes every row say itself
 * twice. What's left that's genuinely new is food about to turn;
 * otherwise the library's own one-liner tells you what the meal is.
 */
function lunchNote(candidate: MealCandidate): string {
  return candidate.meal.batchFriendly
    ? `Lunch prep — make it once, eat it on a few days. ${candidate.meal.description}`.trim()
    : candidate.meal.description;
}

function weekNote(candidate: MealCandidate): string {
  return (
    candidate.notes.find((note) => note.startsWith("Uses up")) ??
    candidate.meal.description
  );
}

/**
 * A meal that's already been cooked this week, expressed as a candidate
 * so it can hold its place in the pool. It carries no missing
 * ingredients because the shopping for it is done.
 */
function breakfastNote(candidate: MealCandidate): string {
  return candidate.meal.batchFriendly
    ? "Makes ahead, so breakfast is waiting."
    : `${candidate.meal.activeMinutes} minutes on the morning.`;
}

/**
 * Breakfasts for the week (Phase 19): quick ones made on the morning
 * (ten minutes or less), or ones that make ahead in a batch; fewest
 * things to buy first, each a different protein where the library allows.
 */
function pickBreakfasts(
  candidates: MealCandidate[],
  count: number,
  mode: WeekStyle["breakfast"],
): MealCandidate[] {
  if (count <= 0) return [];
  const fits = (entry: MealCandidate) =>
    mode === "make_ahead"
      ? entry.meal.batchFriendly
      : entry.meal.activeMinutes <= QUICK_MINUTES.breakfast && !entry.meal.batchFriendly;
  const byShop = [...candidates].sort(
    (a, b) => a.missingIngredients.length - b.missingIngredients.length,
  );
  const order = [...byShop.filter(fits), ...byShop.filter((entry) => !fits(entry))];
  const picked: MealCandidate[] = [];
  for (const varied of [true, false]) {
    for (const entry of order) {
      if (picked.length >= count) return picked;
      if (picked.includes(entry)) continue;
      if (varied && picked.some((p) => p.meal.proteinFocus === entry.meal.proteinFocus)) continue;
      picked.push(entry);
    }
  }
  return picked;
}

/** Keeps meals within the hands-on cap, unless that leaves too few to choose from. */
function withinHandsOn(list: MealCandidate[], needed: number, cap = MAX_HANDS_ON_MINUTES): MealCandidate[] {
  const quick = list.filter((entry) => entry.meal.activeMinutes <= cap);
  return quick.length >= needed ? quick : list;
}

function asSettledCandidate(
  mealId: string,
  allMeals: MealDefinition[],
): MealCandidate | null {
  const meal = allMeals.find((entry) => entry.id === mealId);
  if (!meal) return null;
  return {
    meal,
    missingIngredients: [],
    usesUpSoon: [],
    favourite: false,
    notes: [],
  };
}

export async function generateWeekPlan(
  weekStart: string,
  shape: { style?: Partial<Record<keyof WeekStyle, unknown>>; prepOn?: string } = {},
): Promise<WeekPlanResult> {
  const style = normaliseStyle(shape.style);
  // The prep session: the asked-for day if it's one on offer, else the
  // default (the Sunday before, or today mid-week).
  // (The form only offers days still ahead; a day earlier in the week is
  // accepted too, for recording a session that already happened.)
  const today = todayInTimeZone();
  const inRange =
    shape.prepOn && shape.prepOn >= addDaysISO(weekStart, -1) && shape.prepOn <= addDaysISO(weekStart, 6);
  const prepOn = inRange ? shape.prepOn! : defaultPrepDay(weekStart, today);
  // Seven days (or what's left of them): how often each meal is cooked
  // decides how many different meals the week needs.
  const needed = mealsNeeded(style, planDays(weekStart, prepOn).length);
  const { breakfast: breakfasts, lunch: lunches, dinner: dinners } = needed;
  const [pantry, userState, existing, allMeals, lastWeek] = await Promise.all([
    pantryForPlanning(),
    listMealUserState(),
    listWeekPlan(weekStart),
    listMealsForDiet(),
    listWeekPlan(addDaysISO(weekStart, -7)),
  ]);
  // Variety from week to week: last week's meals sit out where there's
  // enough else to choose from.
  const lastWeekIds = new Set(lastWeek.map((row) => row.mealId));
  const freshFirst = (list: MealCandidate[], needed: number) => {
    const fresh = list.filter((entry) => !lastWeekIds.has(entry.meal.id));
    return fresh.length >= needed ? fresh : list;
  };

  /**
   * Re-planning mid-week keeps what's already been cooked. Rebuilding
   * all five would shop again for meals that have been eaten, which is
   * exactly the waste this phase exists to avoid. Cooked meals are
   * seeded first so they also count toward the variety and lunch
   * quotas — two chicken dinners already cooked means no more chicken.
   */
  const cooked = existing.filter((row) => row.cookedOn);
  const cookedIds = new Set(cooked.map((row) => row.mealId));
  const settled = (slot: "dinner" | "lunch") =>
    cooked
      .filter((row) => row.slot === slot)
      .map((row) => asSettledCandidate(row.mealId, allMeals))
      .filter((entry): entry is MealCandidate => entry !== null);
  const cookedSeed = settled("dinner");

  const reasons = new Map<string, string>();
  for (const row of cooked) {
    if (row.reason) reasons.set(row.mealId, row.reason);
  }

  // Breakfasts first (rules-only), so dinners can share their shopping:
  // a week of eggs at breakfast makes an egg dinner nearly free.
  const breakfastPool = pickBreakfasts(
    withinHandsOn(
      freshFirst(
        filterMealCandidates(allMeals, {
          slot: "breakfast",
          today: weekStart,
          pantry,
          userState,
          maxMissingIngredients: Number.MAX_SAFE_INTEGER,
        }),
        breakfasts,
      ),
      breakfasts,
    ),
    breakfasts,
    style.breakfast,
  );
  const breakfastBasket = [...new Set(breakfastPool.flatMap((entry) => entry.meal.coreIngredients))];

  const allCandidates = filterMealCandidates(allMeals, {
    slot: "dinner",
    today: weekStart,
    pantry,
    userState,
    // For a week plan, missing ingredients are the output — that's the
    // shopping list — so the pantry gate has no business here.
    maxMissingIngredients: Number.MAX_SAFE_INTEGER,
  }).filter((entry) => !cookedIds.has(entry.meal.id));
  const candidates = withinHandsOn(freshFirst(allCandidates, dinners), dinners);

  const byId = new Map(candidates.map((entry) => [entry.meal.id, entry]));
  const depth = pantryDepth(candidates);
  let aiPicks: MealCandidate[] = [];
  let mode: "ai" | "rules" = "rules";

  const client = getAi();
  if (client && candidates.length > 0 && dinners > 0) {
    try {
      const prompt = buildPrompt({
        weekStart,
        candidates,
        pantry: pantry.map((item) => item.ingredient),
        stocked: depth.mode === "stocked",
        dinners,
        alsoBuying: breakfastBasket,
      });
      const voice = fuelVoice((await getProfile()).profile);
      const result = await client.structured({
        label: "generateWeekPlan",
        system: `${BEHAVIOURAL_CORE}\n\n${voice}`,
        prompt: prompt,
        effort: "medium",
        schema: WeekChoice,
        name: "week_choice",
      });

      const picks = result?.meals ?? [];
      for (const pick of picks) {
        const candidate = byId.get(pick.mealId);
        // Anything invented is simply dropped; the greedy fills the gap.
        if (!candidate) continue;
        aiPicks.push(candidate);
        reasons.set(pick.mealId, pick.reason);
      }
      if (aiPicks.length > 0) mode = "ai";
    } catch (error) {
      console.error("generateWeekPlan: AI choice failed, using rules", error);
      aiPicks = [];
    }
  }

  // Cooked meals lead the seed so they keep their place and count toward
  // every quota; the AI's picks follow; the greedy fills what's left.
  const prefer = depth.mode === "stocked" ? "use_up" : "overlap";
  const pool = pickWeekPool(candidates, {
    size: dinners,
    seed: [...cookedSeed, ...aiPicks],
    prefer,
    basket: breakfastBasket,
    // Prepping two ahead needs two that keep; otherwise any dinner will do.
    minBatchFriendly: style.dinner === "prep_some" ? 2 : 0,
  });

  // Dedicated lunch preps (Phase 13): rules-only — they're chosen for
  // sharing the dinners' shop, which is arithmetic, not judgment.
  // Fresh-each-day lunches have to be quick; prepped ones have to keep.
  // Widen only as far as needed: first meals not in last week or this
  // week's dinners, then last week's too, then the dinners (a diet that
  // rules out most of the library can leave few that keep).
  const lunchFits = (entry: MealCandidate) =>
    style.lunch === "daily"
      ? entry.meal.activeMinutes <= QUICK_MINUTES.lunch
      : entry.meal.batchFriendly && entry.meal.activeMinutes <= MAX_HANDS_ON_MINUTES;
  const lunchAll = filterMealCandidates(allMeals, {
    slot: "lunch",
    today: weekStart,
    pantry,
    userState,
    maxMissingIngredients: Number.MAX_SAFE_INTEGER,
  }).filter((entry) => !cookedIds.has(entry.meal.id));
  const notDinner = (entry: MealCandidate) => !pool.some((dinner) => dinner.meal.id === entry.meal.id);
  const lunchTiers = [
    lunchAll.filter((entry) => notDinner(entry) && !lastWeekIds.has(entry.meal.id)),
    lunchAll.filter(notDinner),
    lunchAll,
  ];
  const lunchSource =
    lunchTiers.find((tier) => tier.filter(lunchFits).length >= lunches) ?? lunchAll;
  const lunchCandidates =
    lunchSource.filter(lunchFits).length >= lunches ? lunchSource.filter(lunchFits) : lunchSource;
  const lunchPool = pickWeekPool(lunchCandidates, {
    size: lunches,
    minBatchFriendly: style.lunch === "daily" ? 0 : lunches,
    basket: [...breakfastBasket, ...pool.flatMap((entry) => entry.meal.coreIngredients)],
    seed: settled("lunch"),
    prefer,
  });

  // When each meal is made and eaten: the prep session, the evening
  // before, or on the day (food-safety rules in domain/week-prep).
  const days = assignWeek({
    weekStart,
    prepOn,
    style,
    breakfasts: breakfastPool.map((entry) => entry.meal),
    lunches: lunchPool.map((entry) => entry.meal),
    dinners: pool.map((entry) => entry.meal),
  });
  const noteFor = new Map<string, string>([
    ...pool.map((entry) => [entry.meal.id, reasons.get(entry.meal.id) ?? weekNote(entry)] as const),
    ...lunchPool.map((entry) => [entry.meal.id, reasons.get(entry.meal.id) ?? lunchNote(entry)] as const),
    ...breakfastPool.map((entry) => [entry.meal.id, breakfastNote(entry)] as const),
  ]);
  const entries: {
    mealId: string;
    reason: string | null;
    slot: PlanSlot;
    makeOn: string | null;
    eatDays: string[] | null;
  }[] = days.map((day) => ({
    mealId: day.mealId,
    reason: noteFor.get(day.mealId) ?? null,
    slot: day.slot,
    makeOn: day.makeOn,
    eatDays: day.eatDays,
  }));
  // What's been cooked stays, even when it no longer fits the new shape
  // (fewer dinners than already cooked, no lunch preps, a changed diet):
  // dropping it would lose the record and send the list shopping again.
  const planned = new Set(entries.map((entry) => entry.mealId));
  for (const row of cooked) {
    if (planned.has(row.mealId)) continue;
    entries.push({
      mealId: row.mealId,
      reason: row.reason,
      slot: row.slot === "lunch" || row.slot === "breakfast" ? row.slot : "dinner",
      makeOn: row.makeOn,
      eatDays: row.eatDays,
    });
    planned.add(row.mealId);
  }

  const meals = await saveWeekPlan(weekStart, entries);
  await saveWeekMeta(weekStart, {
    prepOn,
    breakfasts,
    lunches,
    dinners,
    breakfastMode: style.breakfast,
    lunchMode: style.lunch,
    dinnerMode: style.dinner,
  });
  // The list builds when asked ("Make my list"); this only keeps the
  // running-low part current, and leaves a built list to say it's stale.
  await refreshShoppingList(weekStart);

  const overlap = scorePoolOverlap([...pool, ...lunchPool].map((entry) => entry.meal));
  console.log(
    `generateWeekPlan ${weekStart}: ${overlap.meals} meals, ${overlap.distinctIngredients} ingredients, ${overlap.sharedIngredients} shared (${mode}, ${depth.mode} kitchen)`,
  );

  return { weekStart, meals, mode };
}
