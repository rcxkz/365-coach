import { beforeAll, describe, expect, it } from "vitest";
import { generateDay } from "./generate-day";
import { EXERCISE_LIBRARY } from "@/data/library";
import { MEAL_LIBRARY } from "@/data/library/meals";
import { upsertExercises } from "@/data/repos/exercises";
import { getFuelDay, upsertMeals } from "@/data/repos/fuel";
import { addJournalEntry } from "@/data/repos/journal";
import { getWorkoutByDate } from "@/data/repos/workouts";

/** Phase 12, end to end without AI: the journal reaches the plans. */
describe("generateDay — journal", () => {
  beforeAll(async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await upsertExercises(EXERCISE_LIBRARY);
    await upsertMeals(MEAL_LIBRARY);
  });

  it("plans a lighter session and a low-effort dinner after a stressed evening", async () => {
    await addJournalEntry({ date: "2026-10-22", stress: "high" });
    const result = await generateDay("2026-10-23");
    expect(result.ok).toBe(true);

    const workout = await getWorkoutByDate("2026-10-23");
    expect(workout!.rationale).toMatch(/Stress is running high/);

    const fuel = await getFuelDay("2026-10-23");
    const dinner = MEAL_LIBRARY.find((meal) => meal.id === fuel?.dinnerMealId);
    expect(dinner).toBeDefined();
    expect(dinner!.activeMinutes).toBeLessThanOrEqual(15);
  });
});
