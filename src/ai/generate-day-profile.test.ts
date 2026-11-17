import { beforeAll, describe, expect, it } from "vitest";
import { generateDay } from "./generate-day";
import { generateFuelDay } from "./generate-fuel";
import { EXERCISE_LIBRARY } from "@/data/library";
import { MEAL_LIBRARY } from "@/data/library/meals";
import { upsertExercises } from "@/data/repos/exercises";
import { upsertMeals } from "@/data/repos/fuel";
import { saveProfile } from "@/data/repos/profile";
import { getWorkoutByDate, setWorkoutStatus } from "@/data/repos/workouts";
import { mealFitsDiet } from "@/domain/profile";

const byId = new Map(EXERCISE_LIBRARY.map((exercise) => [exercise.id, exercise]));

/** Phase 15, end to end without AI: the setup reaches the plans. */
describe("generateDay — the user's setup", () => {
  beforeAll(async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await upsertExercises(EXERCISE_LIBRARY);
    await upsertMeals(MEAL_LIBRARY);
  });

  it("plans only what bodyweight allows, sized to the session length", async () => {
    await saveProfile({ training: { equipment: "bodyweight", sessionMinutes: 30 } });
    await generateDay("2026-03-02");
    const workout = await getWorkoutByDate("2026-03-02");
    expect(workout!.durationMinutes).toBe(30);
    for (const exercise of workout!.exercises) {
      const def = byId.get(exercise.libraryExerciseId!);
      expect(def?.equipment ?? [], exercise.name).not.toContain("barbell");
    }
    expect(workout!.exercises.every((e) => e.inShortVersion)).toBe(true);
  });

  it("plans no training when it's switched off, and keeps food", async () => {
    await saveProfile({ modules: { train: false, fuel: true, journal: true } });
    const result = await generateDay("2026-03-03");
    expect(result).toEqual({ ok: true, title: "Food only", mode: "food_only" });
    expect(await getWorkoutByDate("2026-03-03")).toBeNull();
  });

  it("never suggests a dinner that breaks a dietary rule", async () => {
    await saveProfile({ food: { diet: ["vegetarian"] } });
    for (const date of ["2026-03-04", "2026-03-05", "2026-03-06"]) {
      const { day } = await generateFuelDay(date);
      const meal = MEAL_LIBRARY.find((m) => m.id === day.dinnerMealId);
      if (meal) expect(mealFitsDiet(meal, ["vegetarian"]), meal.name).toBe(true);
    }
  });
});

describe("generateDay — plans and the weekly ceiling", () => {
  it("follows the chosen plan's rotation", async () => {
    await saveProfile({ training: { plan: "upper_lower", daysPerWeek: 6 } });
    const result = await generateDay("2026-04-06");
    expect(result.ok && result.title).toBe("Upper (Pull)");
    expect((await getWorkoutByDate("2026-04-06"))!.rotationKey).toBe("UL-U1");
  });

  it("rests once the week holds the days asked for", async () => {
    await saveProfile({ training: { plan: "full_body", daysPerWeek: 2 } });
    for (const date of ["2026-04-13", "2026-04-14"]) {
      await generateDay(date);
      await setWorkoutStatus((await getWorkoutByDate(date))!.id, "completed");
    }
    expect(await generateDay("2026-04-15")).toEqual({ ok: true, title: "Rest day", mode: "rest_day" });
    expect(await getWorkoutByDate("2026-04-15")).toBeNull();
    // Next Monday starts fresh.
    const monday = await generateDay("2026-04-20");
    expect(monday.ok && monday.mode).not.toBe("rest_day");
  });
});
