import { EXERCISE_LIBRARY } from "./library";
import { MEAL_LIBRARY } from "./library/meals";
import { upsertExercises } from "./repos/exercises";
import { upsertMeals } from "./repos/fuel";

/**
 * Brings the database up to date with the code-defined libraries.
 * Exercises and meals are owned by the code, so they're upserted; the
 * user's own state about them lives in separate tables and is never
 * touched.
 */
export async function syncLibraries(): Promise<{
  exercises: number;
  meals: number;
}> {
  const exercises = await upsertExercises(EXERCISE_LIBRARY);
  const meals = await upsertMeals(MEAL_LIBRARY);
  return { exercises, meals };
}
