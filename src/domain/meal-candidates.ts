import type { MealDefinition, MealSlot } from "./meals";
import { formatIngredient, formatList } from "./meals";

/**
 * Deterministic meal gating (Phase 3 design F2 — the same
 * gates-then-judgment split as training). Nothing that can't actually
 * be cooked tonight reaches the suggestion, and nothing is assumed to
 * be in the house that the user hasn't recorded (F3).
 */

/** Meals cooked within this many days are rested, not banned. */
const REPEAT_COOLDOWN_DAYS = 3;
/** Beyond this, it's a shopping trip rather than dinner. */
const DEFAULT_MAX_MISSING = 2;

export interface PantryItem {
  ingredient: string;
  /** ISO date; drives "use this up" prompts. */
  useByDate?: string | null;
}

export interface MealUserState {
  mealId: string;
  makeAgain: boolean | null;
  lastCookedOn: string | null;
}

export interface MealContext {
  slot: MealSlot;
  /** Today, ISO — for cooldown and use-by comparisons. */
  today: string;
  pantry: PantryItem[];
  userState: MealUserState[];
  /** Hands-on minutes available; the whole point of doc 04. */
  maxActiveMinutes?: number;
  maxMissingIngredients?: number;
}

export interface MealCandidate {
  meal: MealDefinition;
  /** Core ingredients not currently recorded in the pantry. */
  missingIngredients: string[];
  /** Pantry items this meal would use before they go off. */
  usesUpSoon: string[];
  favourite: boolean;
  /** Plain-language notes for the AI and the fallback copy. */
  notes: string[];
}

function daysBetween(from: string, to: string): number {
  const a = Date.UTC(
    ...(from.split("-").map(Number) as [number, number, number]),
  );
  const b = Date.UTC(...(to.split("-").map(Number) as [number, number, number]));
  return Math.round((b - a) / 86_400_000);
}

export function filterMealCandidates(
  meals: MealDefinition[],
  context: MealContext,
): MealCandidate[] {
  const pantrySet = new Set(context.pantry.map((item) => item.ingredient));
  const soon = new Map<string, string>();
  for (const item of context.pantry) {
    if (!item.useByDate) continue;
    const days = daysBetween(context.today, item.useByDate);
    if (days >= 0 && days <= 3) soon.set(item.ingredient, item.useByDate);
  }

  const stateByMeal = new Map(
    context.userState.map((state) => [state.mealId, state]),
  );
  const maxMissing = context.maxMissingIngredients ?? DEFAULT_MAX_MISSING;

  const candidates: MealCandidate[] = [];
  for (const meal of meals) {
    if (!meal.slots.includes(context.slot)) continue;
    if (
      context.maxActiveMinutes !== undefined &&
      meal.activeMinutes > context.maxActiveMinutes
    ) {
      continue;
    }

    const state = stateByMeal.get(meal.id);
    if (state?.makeAgain === false) continue;
    if (
      state?.lastCookedOn &&
      daysBetween(state.lastCookedOn, context.today) < REPEAT_COOLDOWN_DAYS
    ) {
      continue;
    }

    const missingIngredients = meal.coreIngredients.filter(
      (ingredient) => !pantrySet.has(ingredient),
    );
    if (missingIngredients.length > maxMissing) continue;

    const usesUpSoon = [
      ...meal.coreIngredients,
      ...(meal.flexIngredients ?? []),
    ].filter((ingredient) => soon.has(ingredient));

    const notes: string[] = [];
    if (missingIngredients.length === 0) {
      notes.push("Everything for this is already in.");
    } else {
      notes.push(`Needs ${formatList(missingIngredients.map(formatIngredient))}.`);
    }
    if (usesUpSoon.length > 0) {
      notes.push(
        `Uses up ${formatList(usesUpSoon.map(formatIngredient))} before it turns.`,
      );
    }
    if (meal.batchFriendly && context.slot === "dinner") {
      notes.push("Scales up to leave tomorrow's lunch.");
    }
    if (meal.attention === "low") {
      notes.push(`Only ${meal.activeMinutes} minutes hands-on.`);
    }

    candidates.push({
      meal,
      missingIngredients,
      usesUpSoon,
      favourite: state?.makeAgain === true,
      notes,
    });
  }
  return candidates;
}

/**
 * Rules-only pick when AI is unavailable: what's already in the house,
 * then favourites, then whatever uses food up, then least effort.
 * Mirrors composeFallbackSession — the day still gets an answer.
 */
export function pickFallbackMeals(candidates: MealCandidate[]): {
  main: MealCandidate;
  alternative: MealCandidate | null;
} | null {
  if (candidates.length === 0) return null;

  const ranked = [...candidates].sort((a, b) => {
    if (a.missingIngredients.length !== b.missingIngredients.length) {
      return a.missingIngredients.length - b.missingIngredients.length;
    }
    if (a.favourite !== b.favourite) return a.favourite ? -1 : 1;
    if (a.usesUpSoon.length !== b.usesUpSoon.length) {
      return b.usesUpSoon.length - a.usesUpSoon.length;
    }
    return a.meal.activeMinutes - b.meal.activeMinutes;
  });

  const main = ranked[0];
  // The alternative earns its place by being genuinely easier.
  const alternative =
    ranked
      .slice(1)
      .find(
        (candidate) => candidate.meal.activeMinutes < main.meal.activeMinutes,
      ) ??
    ranked[1] ??
    null;

  return { main, alternative };
}
