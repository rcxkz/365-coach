import { z } from "zod";
import { BEHAVIOURAL_CORE } from "./behavioural-core";
import { getProfile } from "@/data/repos/profile";
import { getAi } from "./client";
import { fuelVoice } from "./voices/fuel";
import {
  listMealsForDiet,
  listMealUserState,
  pantryForPlanning,
  saveFuelDay,
  type FuelDay,
} from "@/data/repos/fuel";
import { mealsEatenOn, uncookedWeekMeals } from "@/data/repos/week-plan";
import { getWorkoutByDate } from "@/data/repos/workouts";
import { listJournalEntries, toJournalEntry } from "@/data/repos/journal";
import { addDaysISO, startOfWeekISO } from "@/domain/dates";
import {
  currentFeeling,
  describeFeeling,
  dinnerEffortCap,
} from "@/domain/journal";
import {
  filterMealCandidates,
  pickFallbackMeals,
  type MealCandidate,
} from "@/domain/meal-candidates";
import { formatIngredient } from "@/domain/meals";

/**
 * Tonight's food decision (Phase 3 design F2): deterministic gates
 * decide what can be cooked; the AI picks between those and writes the
 * reason. When AI is unavailable the rules pick — dinner is never a
 * blank screen (doc 04: the best option must feel like the easiest).
 */

const FuelChoice = z.object({
  dinnerMealId: z.string().describe("Meal id, copied exactly from the options"),
  dinnerReason: z
    .string()
    .describe("One short sentence — why this one tonight"),
  alternativeMealId: z
    .string()
    .nullable()
    .describe("A genuinely lower-effort option, or null"),
  alternativeReason: z.string().nullable(),
});

export type FuelResult = { day: FuelDay; mode: "ai" | "rules" };

function describe(candidate: MealCandidate): string {
  const meal = candidate.meal;
  const bits = [
    `${meal.id} — ${meal.name}`,
    `(${meal.activeMinutes} min hands-on of ${meal.totalMinutes} total, ${meal.attention} attention)`,
  ];
  if (candidate.missingIngredients.length === 0) {
    bits.push("[all ingredients in]");
  } else {
    bits.push(
      `[needs ${candidate.missingIngredients.map(formatIngredient).join(", ")}]`,
    );
  }
  if (candidate.usesUpSoon.length > 0) {
    bits.push(
      `[uses up ${candidate.usesUpSoon.map(formatIngredient).join(", ")}]`,
    );
  }
  if (candidate.favourite) bits.push("[user said make again]");
  if (meal.batchFriendly) bits.push("[batches for lunch]");
  return bits.join(" ");
}

function buildPrompt(input: {
  date: string;
  candidates: MealCandidate[];
  trainingToday: string | null;
  fromWeekPlan: boolean;
  feeling: string[];
}): string {
  const parts = [
    `Choose dinner for ${input.date}.`,
    input.trainingToday
      ? `Training today: ${input.trainingToday}.`
      : "No training logged for today.",
    input.feeling.length
      ? `How they feel today, from their journal: ${input.feeling.join(" ")} Let it shape the choice — on a hard day, the easiest good option wins; with an unsettled stomach, something simple and plain.`
      : "",
    input.fromWeekPlan
      ? "These are the meals planned for this week and not yet cooked — the shopping was done for them, so choosing outside this set wastes food."
      : "",
    `Options — use the id exactly as written, and never invent a meal:\n${input.candidates
      .map((candidate) => `  ${describe(candidate)}`)
      .join("\n")}`,
    "Pick one for tonight and, where it helps, one genuinely lower-effort alternative for if the evening goes sideways. Favour meals whose ingredients are already in, food that needs using up, and anything the user has said they'd make again — novelty is not the goal. Each reason is one short sentence in plain language, no more.",
  ];
  return parts.filter(Boolean).join("\n\n");
}

export async function generateFuelDay(date: string): Promise<FuelResult> {
  // A week planned day by day (Phase 17) already says what tonight is:
  // that's what was shopped and prepped for.
  const plannedTonight = (await mealsEatenOn(date)).find((row) => row.slot === "dinner");
  if (plannedTonight) {
    const day = await saveFuelDay({
      date,
      dinnerMealId: plannedTonight.mealId,
      dinnerReason: plannedTonight.makeOn
        ? "Made ahead for tonight: it just needs warming through."
        : "Tonight's dinner in your week plan; the shop covered it.",
      alternativeMealId: null,
      alternativeReason: null,
      mode: "rules",
    });
    return { day, mode: "rules" };
  }

  const [pantry, userState, workout, weekPool, journal, allMeals] = await Promise.all([
    pantryForPlanning(),
    listMealUserState(),
    getWorkoutByDate(date),
    uncookedWeekMeals(startOfWeekISO(date), "dinner"),
    listJournalEntries(addDaysISO(date, -1), date),
    listMealsForDiet(),
  ]);
  const feeling = currentFeeling(journal.map(toJournalEntry), date);

  const candidatesWithin = (maxActiveMinutes: number | undefined) =>
    filterMealCandidates(allMeals, {
      slot: "dinner",
      today: date,
      pantry,
      userState,
      // An empty pantry shouldn't mean an empty screen: allow a short shop.
      maxMissingIngredients: pantry.length === 0 ? 3 : 2,
      maxActiveMinutes,
    });
  // Stressed or flat: dinner should ask little (Phase 12) — unless that
  // leaves nothing, in which case any dinner beats none.
  const effortCap = dinnerEffortCap(feeling);
  const capped = effortCap === undefined ? [] : candidatesWithin(effortCap);
  const allCandidates = capped.length > 0 ? capped : candidatesWithin(undefined);

  /**
   * The week plan wins where it can (decision G8) — the shopping was done
   * for those meals, so suggesting around them wastes food. A pool meal
   * still has to pass the same nightly gates, so anything cooked two days
   * ago or not yet bought drops out, and an empty result quietly widens
   * back to the full library rather than leaving dinner blank.
   */
  const poolIds = new Set(weekPool.map((row) => row.mealId));
  const fromPool = allCandidates.filter((entry) => poolIds.has(entry.meal.id));
  const fromWeekPlan = fromPool.length > 0;
  const candidates = fromWeekPlan ? fromPool : allCandidates;

  if (candidates.length === 0) {
    const day = await saveFuelDay({
      date,
      dinnerMealId: null,
      dinnerReason: null,
      alternativeMealId: null,
      alternativeReason: null,
      mode: "rules",
    });
    return { day, mode: "rules" };
  }

  const allowed = new Set(candidates.map((candidate) => candidate.meal.id));
  const client = getAi();

  if (client) {
    try {
      const prompt = buildPrompt({
        date,
        candidates,
        trainingToday: workout ? workout.title : null,
        fromWeekPlan,
        feeling: describeFeeling(feeling),
      });
      const voice = fuelVoice((await getProfile()).profile);
      const result = await client.structured({
        label: "generateFuelDay",
        system: `${BEHAVIOURAL_CORE}\n\n${voice}`,
        prompt: prompt,
        effort: "low",
        schema: FuelChoice,
        name: "fuel_choice",
      });

      const choice = result;
      if (choice && allowed.has(choice.dinnerMealId)) {
        const alternativeId =
          choice.alternativeMealId && allowed.has(choice.alternativeMealId)
            ? choice.alternativeMealId
            : null;
        const day = await saveFuelDay({
          date,
          dinnerMealId: choice.dinnerMealId,
          dinnerReason: choice.dinnerReason,
          alternativeMealId: alternativeId,
          alternativeReason: alternativeId ? choice.alternativeReason : null,
          mode: "ai",
        });
        return { day, mode: "ai" };
      }
    } catch (error) {
      console.error("generateFuelDay: AI choice failed, using rules", error);
    }
  }

  const picked = pickFallbackMeals(candidates);
  if (!picked) {
    const day = await saveFuelDay({
      date,
      dinnerMealId: null,
      dinnerReason: null,
      alternativeMealId: null,
      alternativeReason: null,
      mode: "rules",
    });
    return { day, mode: "rules" };
  }

  const day = await saveFuelDay({
    date,
    dinnerMealId: picked.main.meal.id,
    dinnerReason: picked.main.notes[0] ?? null,
    alternativeMealId: picked.alternative?.meal.id ?? null,
    alternativeReason: picked.alternative?.notes[0] ?? null,
    mode: "rules",
  });
  return { day, mode: "rules" };
}
