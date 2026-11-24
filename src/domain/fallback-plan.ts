import type { Candidate, SectionCandidates } from "./candidates";
import type { ExerciseCategory } from "./exercises";
import type { SessionTemplate, SessionType } from "./templates";

/**
 * Rules-only session composition (doc 12 failure behaviour, decision
 * D11): when AI is unavailable, the rotation still produces a complete,
 * safe session from the filtered candidates — the morning is never
 * empty. No judgment, no prompts: deterministic picks with the
 * library's prescription defaults.
 */

export interface FallbackExercise {
  libraryExerciseId: string;
  name: string;
  targetSets: number;
  targetReps: string;
  inShortVersion: boolean;
  note: string | null;
}

/** Sections whose exercises survive the shortened 30-minute variant. */
const SHORT_VERSION_ROLES = new Set([
  "Primary Pull",
  "Primary Push",
  "Primary Squat",
  "Hinge",
  "Upper Compound",
  "Lower Compound",
  "Skill Practice",
  "Zone 2",
  "Core",
  "Mobility",
  "Light Movement",
]);

/**
 * Working sections prefer exercises native to the session's type — a
 * strength slot shouldn't fall to a loaded mobility drill just because
 * it scores as "harder".
 */
const PREFERRED_CATEGORIES: Record<SessionType, ExerciseCategory[]> = {
  strength: ["strength", "calisthenics"],
  hybrid: ["strength", "calisthenics", "athleticism"],
  skill: ["calisthenics"],
  athletic: ["athleticism"],
  conditioning: ["conditioning"],
  recovery: ["mobility", "restoration", "conditioning"],
};

/** Sections that prepare or restore — pick easy, not capable. */
const GENTLE_PLACEMENTS = new Set([
  "warm_up",
  "activation",
  "cooldown",
  "restoration",
]);

function isGentleSection(placements: string[]): boolean {
  return placements.every((placement) => GENTLE_PLACEMENTS.has(placement));
}

/**
 * Deterministic pick without a coach's judgment. Working sections take
 * the most capable option within difficulty ≤ 3 and risk ≤ 3 (lowest
 * risk on ties; falls back to lowest risk if the cap excludes all).
 * Gentle sections (warm-up, activation, cooldown, restoration) take the
 * lowest recovery cost and difficulty instead — an ice bath should
 * never beat the sauna just for being harder.
 */
function pickCandidate(
  candidates: Candidate[],
  usedIds: Set<string>,
  gentle: boolean,
  preferredCategories: ExerciseCategory[],
): Candidate | null {
  const fresh = candidates.filter((c) => !usedIds.has(c.exercise.id));
  if (fresh.length === 0) return null;

  if (gentle) {
    return fresh.reduce((best, current) => {
      const b = best.exercise;
      const c = current.exercise;
      if (c.recoveryCost !== b.recoveryCost) {
        return c.recoveryCost < b.recoveryCost ? current : best;
      }
      if (c.difficulty !== b.difficulty) {
        return c.difficulty < b.difficulty ? current : best;
      }
      return c.riskLevel < b.riskLevel ? current : best;
    });
  }

  let capped = fresh.filter(
    (c) => c.exercise.difficulty <= 3 && c.exercise.riskLevel <= 3,
  );
  const preferred = capped.filter((c) =>
    preferredCategories.includes(c.exercise.category),
  );
  if (preferred.length > 0) capped = preferred;
  const pool = capped.length > 0 ? capped : fresh;
  return pool.reduce((best, current) => {
    if (capped.length === 0) {
      return current.exercise.riskLevel < best.exercise.riskLevel
        ? current
        : best;
    }
    if (current.exercise.difficulty !== best.exercise.difficulty) {
      return current.exercise.difficulty > best.exercise.difficulty
        ? current
        : best;
    }
    return current.exercise.riskLevel < best.exercise.riskLevel
      ? current
      : best;
  });
}

export function composeFallbackSession(
  template: SessionTemplate,
  sections: SectionCandidates[],
): FallbackExercise[] {
  const usedIds = new Set<string>();
  const exercises: FallbackExercise[] = [];
  const preferredCategories = PREFERRED_CATEGORIES[template.sessionType];

  for (const { section, candidates } of sections) {
    if (section.optional) continue;
    const gentle = isGentleSection(section.placements);
    for (let slot = 0; slot < section.count; slot++) {
      const pick = pickCandidate(candidates, usedIds, gentle, preferredCategories);
      if (!pick) break;
      usedIds.add(pick.exercise.id);
      // Cautions on their own line, so the card can set them apart from the cue.
      const note = [pick.exercise.cues, ...pick.cautions].filter(Boolean).join("\n") || null;
      exercises.push({
        libraryExerciseId: pick.exercise.id,
        name: pick.exercise.name,
        targetSets: pick.exercise.setsMin,
        targetReps: pick.exercise.repsTarget,
        inShortVersion: SHORT_VERSION_ROLES.has(section.role),
        note,
      });
    }
  }
  return exercises;
}
