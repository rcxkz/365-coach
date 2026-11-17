import { generateDay, type GenerateDayResult } from "./generate-day";
import { getDayActions } from "@/data/repos/today";
import { getWorkoutByDate } from "@/data/repos/workouts";

export type PlanIfNeededResult =
  | { skipped: true; title: string | null; actionsMissing?: true }
  | { skipped: false; result: GenerateDayResult };

/**
 * The nightly/morning guard around generateDay: plan the day only if it
 * has nothing to open. Cron never overwrites a plan made by hand.
 *
 * "Already planned" means the day has something to open, not that a
 * workout row exists. On 31 July a half-written plan left a workout
 * with no actions, and the old guard then skipped every night after —
 * turning one failed run into a permanently blank Today. A workout
 * without a day around it is unfinished work, so re-plan it.
 *
 * Re-planning deletes the workout, which cascades to set logs. Never do
 * that to a session someone has started, even to repair the day.
 */
export async function planIfNeeded(target: string): Promise<PlanIfNeededResult> {
  const [existing, actions] = await Promise.all([
    getWorkoutByDate(target),
    getDayActions(target),
  ]);
  const logged =
    existing?.exercises.some((exercise) => exercise.sets.length > 0) ?? false;

  if (actions.length > 0 || logged) {
    return {
      skipped: true,
      title: existing?.title ?? null,
      ...(logged && actions.length === 0 ? { actionsMissing: true as const } : {}),
    };
  }
  return { skipped: false, result: await generateDay(target) };
}
