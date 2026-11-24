import type { MealCandidate } from "./meal-candidates";
import { shelfOrder, type Aisle, type MealDefinition } from "./meals";

/**
 * The week's food, planned in one sitting (Phase 6 design, doc 04
 * §Shopping Lists).
 *
 * The unit of planning is a *pool* of dinners, not a Mon–Fri rota
 * (decision G1). You cook them in whatever order the week allows, so a
 * missed Tuesday is a meal still available rather than a failure on the
 * screen. Five for seven nights, deliberately (G2) — doc 04 puts lunches
 * on batch portions and leftovers, and real weeks contain eating out.
 *
 * Overlap is the entire argument for planning a week rather than five
 * separate nights (G3). Five unrelated meals is thirty ingredients and
 * half a bag of spinach in the bin; five sharing a base is one small
 * shop.
 */

/** Five dinners for seven nights — the slack is the point (G2). */
export const WEEK_POOL_SIZE = 5;

/** Variety gate: nobody wants chicken five nights running (G4). */
const DEFAULT_MAX_PER_PROTEIN = 2;

/**
 * Lunch defence (G11). Optimising purely for a small shop picks the
 * smallest meals — a week of omelettes and jacket potatoes, which cooks
 * fine and leaves nothing for lunch. Doc 04 puts lunches on batch
 * portions and names impulse takeaway lunches as the behaviour to beat,
 * so the week has to carry at least this many meals that scale up.
 */
const DEFAULT_MIN_BATCH_FRIENDLY = 2;

/**
 * Preference order among equally-overlapping meals: proven first, then
 * whatever's already in, then whatever needs using up, then least
 * effort. Meal id last so the pick is stable across identical inputs.
 */
function compareStrength(a: MealCandidate, b: MealCandidate): number {
  if (a.favourite !== b.favourite) return a.favourite ? -1 : 1;
  if (a.missingIngredients.length !== b.missingIngredients.length) {
    return a.missingIngredients.length - b.missingIngredients.length;
  }
  if (a.usesUpSoon.length !== b.usesUpSoon.length) {
    return b.usesUpSoon.length - a.usesUpSoon.length;
  }
  if (a.meal.activeMinutes !== b.meal.activeMinutes) {
    return a.meal.activeMinutes - b.meal.activeMinutes;
  }
  return a.meal.id.localeCompare(b.meal.id);
}

/**
 * How much of a week the kitchen could already cook (decision W2).
 *
 * Counting items would call ten condiments a full kitchen. Meals you
 * could cook tonight with nothing bought is the measure that means
 * something, and it's what decides whether the week plans around the
 * cupboard or plans freely and shops (W1).
 */
const STOCKED_READY_MEALS = 3;

export interface PantryDepth {
  /** Cookable with nothing bought. */
  readyMeals: number;
  /** Cookable after picking up one thing. */
  nearMeals: number;
  mode: "stocked" | "bare";
}

export function pantryDepth(candidates: MealCandidate[]): PantryDepth {
  let readyMeals = 0;
  let nearMeals = 0;
  for (const candidate of candidates) {
    if (candidate.missingIngredients.length === 0) readyMeals += 1;
    else if (candidate.missingIngredients.length === 1) nearMeals += 1;
  }
  return {
    readyMeals,
    nearMeals,
    mode: readyMeals >= STOCKED_READY_MEALS ? "stocked" : "bare",
  };
}

export interface WeekPoolOptions {
  size?: number;
  maxPerProtein?: number;
  minBatchFriendly?: number;
  /**
   * `overlap` builds the smallest coherent shop — right when the kitchen
   * is bare and everything is being bought anyway. `use_up` leans on
   * what's already in, which is what a stocked kitchen wants (W1).
   */
  prefer?: "overlap" | "use_up";
  /**
   * Meals already chosen — in practice the AI's picks. They go through
   * the same gates as anything else (duplicates and protein-cap
   * breaches are dropped), and the greedy completes the week around
   * them. One code path, so the AI can't route around a rule.
   */
  seed?: MealCandidate[];
  /**
   * Ingredients already being bought for something else — the week's
   * dinners, when picking its lunches — so overlap counts against them.
   */
  basket?: string[];
}

/**
 * Greedy by overlap: anchor the week on the strongest candidate, then
 * repeatedly take whichever meal adds the fewest *new* ingredients to
 * the basket. This is both the rules-only planner and the shape the AI
 * has to beat — gates in code, judgment in AI (D11).
 *
 * Returns fewer than `size` when the variety gate closes off the rest.
 * A short pool is honest; five chicken dinners is not.
 */
export function pickWeekPool(
  candidates: MealCandidate[],
  options: WeekPoolOptions = {},
): MealCandidate[] {
  const size = options.size ?? WEEK_POOL_SIZE;
  const maxPerProtein = options.maxPerProtein ?? DEFAULT_MAX_PER_PROTEIN;
  const minBatchFriendly =
    options.minBatchFriendly ?? DEFAULT_MIN_BATCH_FRIENDLY;
  const prefer = options.prefer ?? "overlap";
  if (size <= 0) return [];

  const remaining = [...candidates].sort(compareStrength);
  const basket = new Set<string>(options.basket ?? []);
  const proteinCount = new Map<string, number>();
  const chosen = new Set<string>();
  const pool: MealCandidate[] = [];

  const take = (candidate: MealCandidate) => {
    pool.push(candidate);
    chosen.add(candidate.meal.id);
    for (const ingredient of candidate.meal.coreIngredients) {
      basket.add(ingredient);
    }
    const protein = candidate.meal.proteinFocus;
    proteinCount.set(protein, (proteinCount.get(protein) ?? 0) + 1);
    const index = remaining.indexOf(candidate);
    if (index !== -1) remaining.splice(index, 1);
  };

  /**
   * The next meal to take. In `overlap` mode that's whichever adds
   * fewest new ingredients to the basket; in `use_up` mode it's whichever
   * needs least buying, with overlap breaking the ties.
   */
  const cheapest = (
    eligible: (candidate: MealCandidate) => boolean,
  ): MealCandidate | null => {
    let best: MealCandidate | null = null;
    let fewestNew = Infinity;
    let fewestMissing = Infinity;

    for (const candidate of remaining) {
      if (chosen.has(candidate.meal.id)) continue;
      if ((proteinCount.get(candidate.meal.proteinFocus) ?? 0) >= maxPerProtein) {
        continue;
      }
      if (!eligible(candidate)) continue;

      const added = candidate.meal.coreIngredients.filter(
        (ingredient) => !basket.has(ingredient),
      ).length;
      const missing = candidate.missingIngredients.length;

      // `remaining` is pre-sorted by strength, so the first candidate to
      // reach a given score is already the strongest at that score.
      const better =
        prefer === "use_up"
          ? missing < fewestMissing ||
            (missing === fewestMissing && added < fewestNew)
          : added < fewestNew;

      if (better) {
        best = candidate;
        fewestNew = added;
        fewestMissing = missing;
      }
    }
    return best;
  };

  for (const entry of options.seed ?? []) {
    if (pool.length >= size) break;
    if (chosen.has(entry.meal.id)) continue;
    if ((proteinCount.get(entry.meal.proteinFocus) ?? 0) >= maxPerProtein) continue;
    take(entry);
  }

  // With no seed, anchor on strength rather than overlap — against an
  // empty basket every meal "adds" all of itself, so overlap says
  // nothing yet. In use_up mode the anchor has to be something the
  // kitchen can actually make, or the whole week is built off a meal
  // needing a shop.
  // A pre-filled basket (lunches after dinners) already gives overlap
  // something to measure, so the greedy below can anchor on it.
  if (pool.length === 0 && basket.size === 0) {
    if (remaining.length === 0) return [];
    const anchor =
      prefer === "use_up"
        ? [...remaining].sort(
            (a, b) =>
              a.missingIngredients.length - b.missingIngredients.length ||
              compareStrength(a, b),
          )[0]
        : remaining[0];
    take(anchor);
  }

  while (pool.length < size) {
    const slotsLeft = size - pool.length;
    const batchShortfall =
      minBatchFriendly - pool.filter((entry) => entry.meal.batchFriendly).length;

    // Once the remaining slots are exactly what the lunch quota needs,
    // they're reserved for meals that scale up. If the library can't
    // supply one, take the best of the rest rather than plan a short week.
    const reserved = batchShortfall >= slotsLeft;
    const best =
      (reserved ? cheapest((candidate) => candidate.meal.batchFriendly) : null) ??
      cheapest(() => true);

    if (!best) break;
    take(best);
  }

  return pool;
}

export interface ShoppingLine {
  ingredient: string;
  /** Meal names needing it — so dropping a meal explains what leaves. */
  forMeals: string[];
}

export interface ShoppingList {
  toBuy: ShoppingLine[];
  /**
   * Improves a meal but never blocks it. Doc 04: the system should not
   * assume every missing ingredient must be purchased.
   */
  optional: ShoppingLine[];
}

function addLine(
  lines: Map<string, string[]>,
  ingredient: string,
  mealName: string,
): void {
  const existing = lines.get(ingredient);
  if (existing) {
    if (!existing.includes(mealName)) existing.push(mealName);
    return;
  }
  lines.set(ingredient, [mealName]);
}

/**
 * Cupboard, then proteins, then produce, so the list comes out in
 * roughly the order you walk a supermarket rather than alphabetically.
 */
function toLines(
  source: Map<string, string[]>,
  customAisles?: ReadonlyMap<string, Aisle>,
): ShoppingLine[] {
  return [...source.entries()]
    .sort(([a], [b]) => shelfOrder(a, customAisles) - shelfOrder(b, customAisles))
    .map(([ingredient, forMeals]) => ({ ingredient, forMeals }));
}

/**
 * What the week's pool needs that isn't already recorded in the house.
 * Pure — the caller decides what to do with it, and the user always gets
 * the last word on what actually goes in the trolley.
 */
export function deriveShoppingList(
  pool: MealDefinition[],
  pantry: string[],
  options: {
    /** In the house but running low — goes on the list anyway. */
    runningLow?: string[];
    customAisles?: ReadonlyMap<string, Aisle>;
  } = {},
): ShoppingList {
  const have = new Set(pantry);
  const core = new Map<string, string[]>();
  const flex = new Map<string, string[]>();

  for (const meal of pool) {
    for (const ingredient of meal.coreIngredients) {
      if (have.has(ingredient)) continue;
      addLine(core, ingredient, meal.name);
    }
    for (const ingredient of meal.flexIngredients ?? []) {
      if (have.has(ingredient)) continue;
      addLine(flex, ingredient, meal.name);
    }
  }

  for (const ingredient of options.runningLow ?? []) {
    addLine(core, ingredient, "running low");
  }

  // Anything core to one meal is already being bought — it isn't optional.
  for (const ingredient of core.keys()) flex.delete(ingredient);

  return {
    toBuy: toLines(core, options.customAisles),
    optional: toLines(flex, options.customAisles),
  };
}

export interface PoolOverlap {
  meals: number;
  /** Distinct core ingredients across the whole pool. */
  distinctIngredients: number;
  /** Ingredients more than one meal uses — the reason to plan a week. */
  sharedIngredients: number;
}

/** Feeds the one honest line on screen: "5 meals, 14 things, 6 shared". */
export function scorePoolOverlap(pool: MealDefinition[]): PoolOverlap {
  const counts = new Map<string, number>();
  for (const meal of pool) {
    for (const ingredient of new Set(meal.coreIngredients)) {
      counts.set(ingredient, (counts.get(ingredient) ?? 0) + 1);
    }
  }

  let shared = 0;
  for (const count of counts.values()) if (count > 1) shared += 1;

  return {
    meals: pool.length,
    distinctIngredients: counts.size,
    sharedIngredients: shared,
  };
}

/** Bounds for what the user can ask a week to hold (Phase 13). */
export const DINNER_RANGE = { min: 3, max: 7, default: WEEK_POOL_SIZE } as const;
export const LUNCH_RANGE = { min: 0, max: 3, default: 1 } as const;
/** Breakfast varieties in a week (Phase 17); each covers a run of mornings. */
export const BREAKFAST_RANGE = { min: 0, max: 3, default: 2 } as const;

export function clampWeekShape(dinners: number, lunches: number): { dinners: number; lunches: number } {
  const clamp = (value: number, range: { min: number; max: number; default: number }) =>
    Number.isInteger(value) ? Math.min(range.max, Math.max(range.min, value)) : range.default;
  return { dinners: clamp(dinners, DINNER_RANGE), lunches: clamp(lunches, LUNCH_RANGE) };
}

/**
 * Leftover dinners still carry lunch on the days without a prep: two
 * batch dinners with no dedicated lunches (G11), one with one, none
 * needed beyond that.
 */
export function batchDinnersNeeded(lunches: number): number {
  return Math.max(0, 2 - lunches);
}

/**
 * Dedicated lunch preps (Phase 13): lunch meals that aren't already a
 * dinner this week, chosen to share the dinners' shopping, and made in
 * a batch where possible — one prep is several lunches.
 */
export function pickWeekLunches(
  lunchCandidates: MealCandidate[],
  dinners: MealCandidate[],
  count: number,
  options: { seed?: MealCandidate[]; prefer?: "overlap" | "use_up" } = {},
): MealCandidate[] {
  if (count <= 0) return [];
  const dinnerIds = new Set(dinners.map((entry) => entry.meal.id));
  return pickWeekPool(
    lunchCandidates.filter((entry) => !dinnerIds.has(entry.meal.id)),
    {
      size: count,
      minBatchFriendly: count,
      basket: dinners.flatMap((entry) => entry.meal.coreIngredients),
      seed: options.seed,
      prefer: options.prefer,
    },
  );
}
