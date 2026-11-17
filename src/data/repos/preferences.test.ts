import { beforeAll, describe, expect, it } from "vitest";
import { EXERCISE_LIBRARY } from "../library";
import { MEAL_LIBRARY } from "../library/meals";
import {
  listRuledOutExercises,
  RULED_OUT_PREFERENCE,
  upsertExerciseUserState,
  upsertExercises,
} from "./exercises";
import {
  clearMealPreference,
  listRuledOutMeals,
  setMealPreference,
  upsertMeals,
} from "./fuel";
import { addMemory, listMemories, updateMemoryContent } from "./memories";
import {
  createWorkout,
  deleteUnloggedWorkoutExercise,
  getWorkoutByDate,
  logSet,
} from "./workouts";

/** Phase 10: the user's own corrections to what the system knows. */
describe("user preferences", () => {
  beforeAll(async () => {
    await upsertExercises(EXERCISE_LIBRARY);
    await upsertMeals(MEAL_LIBRARY);
  });

  it("lists ruled-out exercises and brings them back", async () => {
    const id = EXERCISE_LIBRARY[0].id;
    await upsertExerciseUserState({ exerciseId: id, preference: RULED_OUT_PREFERENCE });
    expect((await listRuledOutExercises()).map((e) => e.id)).toEqual([id]);
    await upsertExerciseUserState({ exerciseId: id, preference: 0 });
    expect(await listRuledOutExercises()).toEqual([]);
  });

  it("lists not-again meals and brings them back", async () => {
    const id = MEAL_LIBRARY[0].id;
    await setMealPreference(id, false);
    expect((await listRuledOutMeals()).map((m) => m.id)).toEqual([id]);
    await clearMealPreference(id);
    expect(await listRuledOutMeals()).toEqual([]);
  });

  it("lets the user correct a memory", async () => {
    const memory = await addMemory({ tier: "long_term", domain: "fitness", content: "Bench 80kg" });
    await updateMemoryContent(memory.id, "Bench is a long-term goal");
    const [row] = (await listMemories({ domain: "fitness" })).filter((m) => m.id === memory.id);
    expect(row.content).toBe("Bench is a long-term goal");
  });

  it("removes a planned exercise only while nothing is logged", async () => {
    const workout = await createWorkout({
      date: "2026-05-01",
      title: "A",
      exercises: [
        { name: "One", targetSets: 3, targetReps: "8" },
        { name: "Two", targetSets: 3, targetReps: "8" },
      ],
    });
    const [one, two] = workout.exercises;
    await logSet(two.id, { setNumber: 1, reps: 8, weightKg: null });
    expect(await deleteUnloggedWorkoutExercise(one.id)).toBe(true);
    expect(await deleteUnloggedWorkoutExercise(two.id)).toBe(false);
    const names = (await getWorkoutByDate("2026-05-01"))!.exercises.map((e) => e.name);
    expect(names).toEqual(["Two"]);
  });
});
