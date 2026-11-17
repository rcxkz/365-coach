import { beforeAll, describe, expect, it } from "vitest";
import { adaptTodayPlan } from "./adapt-day";
import { EXERCISE_LIBRARY } from "@/data/library";
import { upsertCheckin } from "@/data/repos/checkins";
import { upsertExercises } from "@/data/repos/exercises";
import { listOpenPainFlags, resolvePainFlag, upsertOpenPainFlag } from "@/data/repos/pain";
import {
  createWorkout,
  deleteWorkoutByDate,
  getWorkoutByDate,
  logSet,
} from "@/data/repos/workouts";
import { todayInTimeZone } from "@/domain/dates";

const TODAY = todayInTimeZone();

async function planToday() {
  await deleteWorkoutByDate(TODAY);
  return createWorkout({
    date: TODAY,
    title: "Upper Strength (Pull)",
    rotationKey: "A",
    templateId: "upper_strength",
    durationMinutes: 60,
    exercises: [
      {
        name: "Overhead Press",
        libraryExerciseId: "overhead_press",
        targetSets: 4,
        targetReps: "4-8",
      },
      {
        name: "Conventional Deadlift",
        libraryExerciseId: "conventional_deadlift",
        targetSets: 4,
        targetReps: "3-5",
      },
      {
        name: "Machine Chest Press",
        libraryExerciseId: "machine_chest_press",
        targetSets: 3,
        targetReps: "8-12",
      },
    ],
  });
}

async function clearPain() {
  for (const flag of await listOpenPainFlags()) {
    await resolvePainFlag(flag.id);
  }
}

describe("adaptTodayPlan", () => {
  beforeAll(async () => {
    await upsertExercises(EXERCISE_LIBRARY);
  });

  it("reports when there is no plan to adapt", async () => {
    await deleteWorkoutByDate(TODAY);
    await clearPain();
    expect(await adaptTodayPlan()).toEqual({
      adapted: false,
      reason: "no_plan",
    });
  });

  it("leaves a green day untouched", async () => {
    await planToday();
    await clearPain();
    await upsertCheckin(TODAY, {
      energy: "normal",
      sleep: "normal",
      soreness: "none",
    });
    expect(await adaptTodayPlan()).toEqual({
      adapted: false,
      reason: "no_changes",
    });
  });

  it("substitutes shoulder work and trims volume after a rough night", async () => {
    await planToday();
    await clearPain();
    await upsertOpenPainFlag({ location: "shoulder", severity: 3 });
    await upsertCheckin(TODAY, {
      energy: "normal",
      sleep: "poor",
      soreness: "none",
    });

    const result = await adaptTodayPlan();
    expect(result.adapted).toBe(true);

    const workout = await getWorkoutByDate(TODAY);
    const byOriginal = new Map(
      workout!.exercises.map((exercise) => [exercise.position, exercise]),
    );

    // Overhead press loads the painful shoulder → swapped for a regression.
    const press = byOriginal.get(0)!;
    expect(press.libraryExerciseId).not.toBe("overhead_press");
    expect(press.included).toBe(true);

    // Deadlift exceeds the yellow risk allowance → dropped or swapped.
    const deadlift = byOriginal.get(1)!;
    expect(
      deadlift.included === false ||
        deadlift.libraryExerciseId !== "conventional_deadlift",
    ).toBe(true);

    expect(workout!.notes).toBeTruthy();
    await clearPain();
  });

  it("never rewrites a session that has already started", async () => {
    const workout = await planToday();
    await clearPain();
    await upsertOpenPainFlag({ location: "shoulder", severity: 4 });
    await logSet(workout.exercises[0].id, { setNumber: 1, reps: 5 });

    expect(await adaptTodayPlan()).toEqual({
      adapted: false,
      reason: "already_started",
    });
    const after = await getWorkoutByDate(TODAY);
    expect(after!.exercises[0].libraryExerciseId).toBe("overhead_press");
    await clearPain();
  });
});
