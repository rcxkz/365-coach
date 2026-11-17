import { EXERCISE_LIBRARY } from "@/data/library";
import { getCheckin } from "@/data/repos/checkins";
import { listJournalEntries, toJournalEntry } from "@/data/repos/journal";
import { listOpenPainFlags } from "@/data/repos/pain";
import {
  getWorkoutByDate,
  setWorkoutNotes,
  updateWorkoutExercise,
} from "@/data/repos/workouts";
import { adaptSession } from "@/domain/adapt-session";
import { addDaysISO, todayInTimeZone } from "@/domain/dates";
import { currentFeeling } from "@/domain/journal";
import { assessReadiness } from "@/domain/readiness";

const LIBRARY_BY_ID = new Map(EXERCISE_LIBRARY.map((e) => [e.id, e]));

export type AdaptResult =
  | { adapted: false; reason: "no_plan" | "already_started" | "no_changes" }
  | { adapted: true; changes: string[] };

/**
 * Applies today's check-in to today's planned session (Phase 2 design
 * §2). Deterministic and instant — no AI call, so checking in never
 * blocks and never fails.
 *
 * Never touches a session that has logged sets: once training has
 * started the plan is history, not a draft.
 */
export async function adaptTodayPlan(): Promise<AdaptResult> {
  const date = todayInTimeZone();
  const workout = await getWorkoutByDate(date);
  if (!workout) return { adapted: false, reason: "no_plan" };
  if (workout.exercises.some((exercise) => exercise.sets.length > 0)) {
    return { adapted: false, reason: "already_started" };
  }

  const [checkin, painFlags, journal] = await Promise.all([
    getCheckin(date),
    listOpenPainFlags(),
    listJournalEntries(addDaysISO(date, -1), date),
  ]);
  const painSignals = painFlags.map((flag) => ({
    location: flag.location,
    severity: flag.severity,
  }));
  const readiness = assessReadiness(
    checkin
      ? {
          sleep: checkin.sleep,
          energy: checkin.energy,
          soreness: checkin.soreness,
        }
      : null,
    painSignals,
    currentFeeling(journal.map(toJournalEntry), date),
  );

  const adjustments = adaptSession(workout.exercises, LIBRARY_BY_ID, {
    readiness: readiness.level,
    painFlags: painSignals,
  });
  if (adjustments.length === 0) {
    return { adapted: false, reason: "no_changes" };
  }

  for (const adjustment of adjustments) {
    switch (adjustment.action) {
      case "drop":
        await updateWorkoutExercise(adjustment.exerciseId, {
          included: false,
        });
        break;
      case "reduce_sets":
        await updateWorkoutExercise(adjustment.exerciseId, {
          targetSets: adjustment.targetSets,
        });
        break;
      case "substitute":
        await updateWorkoutExercise(adjustment.exerciseId, {
          libraryExerciseId: adjustment.libraryExerciseId,
          name: adjustment.name,
          targetSets: adjustment.targetSets,
          targetReps: adjustment.targetReps,
          targetWeightKg: null,
          note: adjustment.note,
        });
        break;
    }
  }

  const changes = adjustments.map((adjustment) => adjustment.reason);
  await setWorkoutNotes(workout.id, changes.join(" "));
  return { adapted: true, changes };
}
