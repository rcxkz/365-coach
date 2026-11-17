import { composeDay } from "../domain/compose-day";
import { replaceDayActions } from "./repos/today";
import { createWorkout, getWorkoutByDate } from "./repos/workouts";

/**
 * Starter block for a returning trainee (playbook doc 03: start from the
 * current body, stability before intensity). Gives the app real data to
 * operate on before AI generation lands.
 *
 * Idempotent per date: if the day's workout already exists, does nothing.
 * Returns true when it seeded, false when it skipped.
 */
export async function seedDay(date: string): Promise<boolean> {
  if (await getWorkoutByDate(date)) return false;

  const workout = await createWorkout({
    date,
    title: "Foundation A — Full Body Stability",
    focus: "Rebuild control and confidence",
    rationale:
      "First block back: joint control and movement quality before load, so strength returns without strains.",
    durationMinutes: 60,
    exercises: [
      {
        name: "Assisted pull-up",
        targetSets: 3,
        targetReps: "6-8",
        inShortVersion: true,
        note: "Controlled tempo, full range without aggressive lockout",
      },
      {
        name: "Incline dumbbell press",
        targetSets: 3,
        targetReps: "8-10",
        targetWeightKg: 14,
        inShortVersion: true,
        note: "Neutral grip if the wrist grumbles",
      },
      {
        name: "Goblet squat",
        targetSets: 3,
        targetReps: "10",
        targetWeightKg: 16,
        inShortVersion: true,
      },
      {
        name: "Dumbbell Romanian deadlift",
        targetSets: 3,
        targetReps: "10",
        targetWeightKg: 16,
      },
      {
        name: "Dead bug",
        targetSets: 3,
        targetReps: "8 per side",
        note: "Slow, ribs down",
      },
      {
        name: "Farmer carry",
        targetSets: 3,
        targetReps: "30m",
        targetWeightKg: 20,
      },
    ],
  });

  await replaceDayActions(
    date,
    composeDay({
      workout: {
        domain: "fitness",
        kind: "workout",
        title: workout.title,
        rationale:
          "Training before the work day turns reactive protects the fitness goal.",
        workoutId: workout.id,
      },
      foodActions: [
        {
          domain: "fuel",
          kind: "food",
          title: "Sort tomorrow's lunch tonight",
          detail: "Leftovers, a batch cook, or a simple assembly meal",
          rationale: "A prepared lunch is the best takeaway defence.",
        },
      ],
    }),
  );

  return true;
}
