import { RateLimitError } from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { BEHAVIOURAL_CORE } from "./behavioural-core";
import { getProfile } from "@/data/repos/profile";
import { getAnthropic, MODEL_FALLBACK, MODEL_PRIMARY } from "./client";
import { fuelVoice } from "./voices/fuel";
import {
  listMealsForDiet,
  listMealUserState,
  pantryForPlanning,
} from "@/data/repos/fuel";
import {
  listWeekPlan,
  refreshShoppingList,
  saveWeekPlan,
  type WeekPlanMealRow,
} from "@/data/repos/week-plan";
import {
  filterMealCandidates,
  type MealCandidate,
} from "@/domain/meal-candidates";
import { formatIngredient, type MealDefinition } from "@/domain/meals";
import {
  pantryDepth,
  pickWeekPool,
  scorePoolOverlap,
  batchDinnersNeeded,
  clampWeekShape,
  LUNCH_RANGE,
  pickWeekLunches,
  WEEK_POOL_SIZE,
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
}): string {
  return [
    `Plan ${input.dinners} dinners for the week beginning ${input.weekStart}.`,
    `They're for seven nights on purpose — the slack covers eating out and leftovers, so don't try to fill every night.`,
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
      "Favour a couple that batch into lunch — impulse lunches are the behaviour this is defending against.",
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
  shape: { dinners?: number; lunches?: number } = {},
): Promise<WeekPlanResult> {
  const { dinners, lunches } = clampWeekShape(
    shape.dinners ?? WEEK_POOL_SIZE,
    shape.lunches ?? LUNCH_RANGE.default,
  );
  const [pantry, userState, existing, allMeals] = await Promise.all([
    pantryForPlanning(),
    listMealUserState(),
    listWeekPlan(weekStart),
    listMealsForDiet(),
  ]);

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

  const candidates = filterMealCandidates(allMeals, {
    slot: "dinner",
    today: weekStart,
    pantry,
    userState,
    // For a week plan, missing ingredients are the output — that's the
    // shopping list — so the pantry gate has no business here.
    maxMissingIngredients: Number.MAX_SAFE_INTEGER,
  }).filter((entry) => !cookedIds.has(entry.meal.id));

  const byId = new Map(candidates.map((entry) => [entry.meal.id, entry]));
  const depth = pantryDepth(candidates);
  let aiPicks: MealCandidate[] = [];
  let mode: "ai" | "rules" = "rules";

  const client = getAnthropic();
  if (client && candidates.length > 0) {
    try {
      const prompt = buildPrompt({
        weekStart,
        candidates,
        pantry: pantry.map((item) => item.ingredient),
        stocked: depth.mode === "stocked",
        dinners,
      });
      const voice = fuelVoice((await getProfile()).profile);
      const call = (model: string) =>
        client.messages.parse({
          model,
          max_tokens: 2000,
          system: `${BEHAVIOURAL_CORE}\n\n${voice}`,
          messages: [{ role: "user", content: prompt }],
          output_config: { format: zodOutputFormat(WeekChoice) },
        });

      let response;
      try {
        response = await call(MODEL_PRIMARY);
      } catch (error) {
        if (!(error instanceof RateLimitError)) throw error;
        response = await call(MODEL_FALLBACK);
      }

      const picks = response.parsed_output?.meals ?? [];
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
    minBatchFriendly: batchDinnersNeeded(lunches),
  });

  // Dedicated lunch preps (Phase 13): rules-only — they're chosen for
  // sharing the dinners' shop, which is arithmetic, not judgment.
  const lunchCandidates = filterMealCandidates(allMeals, {
    slot: "lunch",
    today: weekStart,
    pantry,
    userState,
    maxMissingIngredients: Number.MAX_SAFE_INTEGER,
  }).filter((entry) => !cookedIds.has(entry.meal.id));
  const lunchPool = pickWeekLunches(lunchCandidates, pool, lunches, {
    seed: settled("lunch"),
    prefer,
  });

  const meals = await saveWeekPlan(weekStart, [
    ...pool.map((entry) => ({
      mealId: entry.meal.id,
      reason: reasons.get(entry.meal.id) ?? weekNote(entry),
      slot: "dinner" as const,
    })),
    ...lunchPool.map((entry) => ({
      mealId: entry.meal.id,
      reason: reasons.get(entry.meal.id) ?? lunchNote(entry),
      slot: "lunch" as const,
    })),
  ]);

  await refreshShoppingList(weekStart);

  const overlap = scorePoolOverlap([...pool, ...lunchPool].map((entry) => entry.meal));
  console.log(
    `generateWeekPlan ${weekStart}: ${overlap.meals} meals, ${overlap.distinctIngredients} ingredients, ${overlap.sharedIngredients} shared (${mode}, ${depth.mode} kitchen)`,
  );

  return { weekStart, meals, mode };
}
