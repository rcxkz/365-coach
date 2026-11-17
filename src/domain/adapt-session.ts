import { PAIN_EXCLUSION_SEVERITY, riskAllowanceFor } from "./candidates";
import type { ExerciseDefinition } from "./exercises";
import type { PainSignal, ReadinessLevel } from "./readiness";

/**
 * Deterministic morning adaptation (Phase 2 design §2, doc 12): once
 * the user checks in, today's planned session is adjusted to the
 * readiness they actually woke up with — no AI call, so the check-in
 * tap stays instant and works offline (layer rule: the UI never blocks
 * on live AI).
 *
 * Red days are not adapted here; the caller replaces the session with
 * recovery instead.
 */

export interface PlannedExercise {
  /** workout_exercises.id */
  id: number;
  libraryExerciseId: string | null;
  name: string;
  targetSets: number;
  included: boolean;
}

export type SessionAdjustment =
  | { exerciseId: number; action: "drop"; reason: string }
  | {
      exerciseId: number;
      action: "reduce_sets";
      targetSets: number;
      reason: string;
    }
  | {
      exerciseId: number;
      action: "substitute";
      libraryExerciseId: string;
      name: string;
      targetSets: number;
      targetReps: string;
      note: string;
      reason: string;
    };

/** Minimum working sets left after a volume cut. */
const MIN_SETS = 2;
/** Exercises at or above this recovery cost lose a set on a yellow day. */
const HIGH_RECOVERY_COST = 4;

function formatArea(area: string): string {
  return area.replace(/_/g, " ");
}

function painfulAreas(painFlags: PainSignal[]): string[] {
  return painFlags
    .filter((flag) => flag.severity >= PAIN_EXCLUSION_SEVERITY)
    .map((flag) => flag.location);
}

function aggravates(
  def: ExerciseDefinition,
  areas: string[],
): string | null {
  for (const area of areas) {
    if (def.avoidAreas?.includes(area as never)) return area;
  }
  return null;
}

/**
 * First alternative that clears the same gates: regressions before
 * substitutions (preserve the movement pattern where possible, doc 14).
 */
function findReplacement(
  def: ExerciseDefinition,
  library: Map<string, ExerciseDefinition>,
  areas: string[],
  riskAllowance: number,
  usedIds: Set<string>,
): ExerciseDefinition | null {
  const options = [...(def.regressions ?? []), ...(def.substitutions ?? [])];
  for (const id of options) {
    const option = library.get(id);
    if (!option || usedIds.has(option.id)) continue;
    if (aggravates(option, areas)) continue;
    if (option.riskLevel > riskAllowance) continue;
    return option;
  }
  return null;
}

export function adaptSession(
  planned: PlannedExercise[],
  library: Map<string, ExerciseDefinition>,
  context: { readiness: ReadinessLevel; painFlags: PainSignal[] },
): SessionAdjustment[] {
  const areas = painfulAreas(context.painFlags);
  const riskAllowance = riskAllowanceFor(context.readiness);
  const usedIds = new Set(
    planned
      .filter((exercise) => exercise.included && exercise.libraryExerciseId)
      .map((exercise) => exercise.libraryExerciseId as string),
  );

  const adjustments: SessionAdjustment[] = [];
  for (const exercise of planned) {
    if (!exercise.included) continue;
    const def = exercise.libraryExerciseId
      ? library.get(exercise.libraryExerciseId)
      : undefined;
    if (!def) continue;

    const painArea = aggravates(def, areas);
    const tooRisky = def.riskLevel > riskAllowance;

    if (painArea || tooRisky) {
      const reason = painArea
        ? `${exercise.name} loads the ${formatArea(painArea)} you flagged`
        : `${exercise.name} is a lot to ask of today's readiness`;
      const replacement = findReplacement(
        def,
        library,
        areas,
        riskAllowance,
        usedIds,
      );
      if (replacement) {
        usedIds.delete(def.id);
        usedIds.add(replacement.id);
        adjustments.push({
          exerciseId: exercise.id,
          action: "substitute",
          libraryExerciseId: replacement.id,
          name: replacement.name,
          targetSets: Math.min(exercise.targetSets, replacement.setsMax),
          targetReps: replacement.repsTarget,
          note: replacement.cues,
          reason: `${reason} — swapped to ${replacement.name}.`,
        });
      } else {
        usedIds.delete(def.id);
        adjustments.push({
          exerciseId: exercise.id,
          action: "drop",
          reason: `${reason} — left out today.`,
        });
      }
      continue;
    }

    if (
      context.readiness === "yellow" &&
      def.recoveryCost >= HIGH_RECOVERY_COST &&
      exercise.targetSets > MIN_SETS
    ) {
      adjustments.push({
        exerciseId: exercise.id,
        action: "reduce_sets",
        targetSets: exercise.targetSets - 1,
        reason: `${exercise.name} drops a set to keep the session sustainable.`,
      });
    }
  }
  return adjustments;
}
