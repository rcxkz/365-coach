import { describe, expect, it } from "vitest";
import {
  createWorkout,
  deleteSetLog,
  deleteWorkoutByDate,
  getRecentRotationKeys,
  getWorkoutByDate,
  listRecentWorkouts,
  listTrainedDates,
  includeAllExercises,
  logSet,
  setIncludedExercises,
  setWorkoutStatus,
  updateWorkoutDuration,
} from "./workouts";

function foundationWorkout(date: string) {
  return {
    date,
    title: "Foundation A",
    focus: "Full body stability",
    rationale: "Rebuilds control before intensity",
    durationMinutes: 60,
    exercises: [
      { name: "Assisted pull-up", targetSets: 3, targetReps: "6-8", inShortVersion: true },
      { name: "Incline dumbbell press", targetSets: 3, targetReps: "8-10", targetWeightKg: 14, inShortVersion: true },
      { name: "Goblet squat", targetSets: 3, targetReps: "10", targetWeightKg: 16 },
    ],
  };
}

describe("workouts repo", () => {
  it("creates a workout with ordered exercises", async () => {
    const workout = await createWorkout(foundationWorkout("2026-07-20"));
    expect(workout.status).toBe("planned");
    expect(workout.exercises.map((e) => e.name)).toEqual([
      "Assisted pull-up",
      "Incline dumbbell press",
      "Goblet squat",
    ]);
    expect(workout.exercises.map((e) => e.position)).toEqual([0, 1, 2]);
  });

  it("rejects a second workout on the same date", async () => {
    await createWorkout(foundationWorkout("2026-07-21"));
    await expect(createWorkout(foundationWorkout("2026-07-21"))).rejects.toThrow();
  });

  it("fetches by date with empty set logs", async () => {
    await createWorkout(foundationWorkout("2026-07-22"));
    const workout = await getWorkoutByDate("2026-07-22");
    expect(workout).not.toBeNull();
    expect(workout!.exercises).toHaveLength(3);
    expect(workout!.exercises.every((e) => e.sets.length === 0)).toBe(true);
  });

  it("returns null when no workout exists", async () => {
    expect(await getWorkoutByDate("1999-01-01")).toBeNull();
  });

  it("logSet upserts by exercise and set number", async () => {
    const workout = await createWorkout(foundationWorkout("2026-07-23"));
    const exercise = workout.exercises[0];
    await logSet(exercise.id, { setNumber: 1, reps: 6 });
    await logSet(exercise.id, { setNumber: 1, reps: 8, weightKg: 5 });
    const refetched = await getWorkoutByDate("2026-07-23");
    const sets = refetched!.exercises[0].sets;
    expect(sets).toHaveLength(1);
    expect(sets[0].reps).toBe(8);
    expect(sets[0].weightKg).toBe(5);
  });

  it("deleteSetLog un-logs a set and tolerates unknown sets", async () => {
    const workout = await createWorkout(foundationWorkout("2026-07-30"));
    const exercise = workout.exercises[0];
    await logSet(exercise.id, { setNumber: 1, reps: 6 });
    await logSet(exercise.id, { setNumber: 2, reps: 6 });
    await deleteSetLog(exercise.id, 1);
    const refetched = await getWorkoutByDate("2026-07-30");
    const sets = refetched!.exercises[0].sets;
    expect(sets).toHaveLength(1);
    expect(sets[0].setNumber).toBe(2);
    // Never-logged set: silent no-op.
    await deleteSetLog(exercise.id, 3);
  });

  it("shortens and restores the session via inclusion flags", async () => {
    const workout = await createWorkout(foundationWorkout("2026-07-25"));
    const keepIds = workout.exercises
      .filter((e) => e.inShortVersion)
      .map((e) => e.id);
    await setIncludedExercises(workout.id, keepIds);
    const shortened = await getWorkoutByDate("2026-07-25");
    expect(shortened!.exercises.filter((e) => e.included)).toHaveLength(2);
    await includeAllExercises(workout.id);
    const restored = await getWorkoutByDate("2026-07-25");
    expect(restored!.exercises.every((e) => e.included)).toBe(true);
  });

  it("deletes a workout by date, tolerating absence", async () => {
    await createWorkout(foundationWorkout("2026-07-19"));
    await deleteWorkoutByDate("2026-07-19");
    expect(await getWorkoutByDate("2026-07-19")).toBeNull();
    await expect(deleteWorkoutByDate("2026-07-19")).resolves.toBeUndefined();
  });

  it("updates status and duration", async () => {
    const workout = await createWorkout(foundationWorkout("2026-07-24"));
    await setWorkoutStatus(workout.id, "completed");
    await updateWorkoutDuration(workout.id, 30);
    const refetched = await getWorkoutByDate("2026-07-24");
    expect(refetched!.status).toBe("completed");
    expect(refetched!.durationMinutes).toBe(30);
  });
});

/**
 * Decision T1: a skipped session doesn't consume its rotation slot, so
 * it stays due. Counting it would quietly delete a session type from
 * the fortnight because of one bad day.
 */
describe("rotation and skipped sessions", () => {
  it("counts a session that happened", async () => {
    await createWorkout({
      ...foundationWorkout("2026-10-05"),
      rotationKey: "A",
    });
    expect(await getRecentRotationKeys()).toContain("A");
  });

  it("does not count a session that was skipped", async () => {
    const workout = await createWorkout({
      ...foundationWorkout("2026-10-06"),
      rotationKey: "F",
    });
    expect(await getRecentRotationKeys()).toContain("F");

    await setWorkoutStatus(workout.id, "skipped");
    expect(await getRecentRotationKeys()).not.toContain("F");
  });

  it("counts it again once the user changes their mind", async () => {
    const workout = await createWorkout({
      ...foundationWorkout("2026-10-07"),
      rotationKey: "E",
    });
    await setWorkoutStatus(workout.id, "skipped");
    await setWorkoutStatus(workout.id, "planned");
    expect(await getRecentRotationKeys()).toContain("E");
  });
});

/** Decision T3/T4: the backdating list, and what it's honest about. */
describe("listRecentWorkouts", () => {
  it("lists sessions before today, newest first", async () => {
    await createWorkout(foundationWorkout("2026-11-02"));
    await createWorkout(foundationWorkout("2026-11-04"));
    await createWorkout(foundationWorkout("2026-11-03"));

    const recent = await listRecentWorkouts("2026-11-05");
    const dates = recent.map((row) => row.date);
    expect(dates.slice(0, 3)).toEqual(["2026-11-04", "2026-11-03", "2026-11-02"]);
  });

  it("leaves today and anything ahead of it out", async () => {
    const recent = await listRecentWorkouts("2026-11-03");
    expect(recent.map((row) => row.date)).not.toContain("2026-11-03");
    expect(recent.map((row) => row.date)).not.toContain("2026-11-04");
  });

  it("shows a day trained but never logged as exactly that", async () => {
    const workout = await createWorkout(foundationWorkout("2026-11-06"));
    await setWorkoutStatus(workout.id, "completed");

    const [session] = await listRecentWorkouts("2026-11-07", 1);
    expect(session.status).toBe("completed");
    // T4: attendance and volume are different facts, and marking a day
    // trained must never invent sets that progression would act on.
    expect(session.setsLogged).toBe(0);
  });

  it("counts the sets when they were logged", async () => {
    const workout = await createWorkout(foundationWorkout("2026-11-08"));
    await logSet(workout.exercises[0].id, { setNumber: 1, reps: 8 });
    await logSet(workout.exercises[0].id, { setNumber: 2, reps: 8 });

    const [session] = await listRecentWorkouts("2026-11-09", 1);
    expect(session.setsLogged).toBe(2);
  });
});

describe("listTrainedDates", () => {
  it("counts finished or logged sessions, not planned or skipped ones", async () => {
    const exercise = { name: "Goblet squat", targetSets: 3, targetReps: "10" };
    const finished = await createWorkout({ date: "2025-03-01", title: "A", exercises: [exercise] });
    await setWorkoutStatus(finished.id, "completed");
    const logged = await createWorkout({ date: "2025-03-03", title: "B", exercises: [exercise] });
    await logSet(logged.exercises[0].id, { setNumber: 1, reps: 10, weightKg: 16 });
    await logSet(logged.exercises[0].id, { setNumber: 2, reps: 10, weightKg: 16 });
    await createWorkout({ date: "2025-03-05", title: "C", exercises: [exercise] });
    const skipped = await createWorkout({ date: "2025-03-07", title: "D", exercises: [exercise] });
    await setWorkoutStatus(skipped.id, "skipped");

    const dates = (await listTrainedDates("2025-03-10")).filter((d) => d.startsWith("2025-03"));
    expect(dates).toEqual(["2025-03-03", "2025-03-01"]);
  });
});
