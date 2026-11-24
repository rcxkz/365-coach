import type { Equipment, ExerciseDefinition } from "./exercises";
import type { PainSignal, ReadinessLevel } from "./readiness";
import type { SessionTemplate, TemplateSection } from "./templates";
import { formatList } from "./meals";

/**
 * Deterministic candidate filtering (Phase 2 design §3, decision D11):
 * hard gates in code, judgment in AI. The AI only ever selects from
 * lists produced here, so an unsafe or unavailable exercise cannot
 * appear in a session by construction.
 */

/** Maximum exercise riskLevel permitted at each readiness level. */
const RISK_ALLOWANCE: Record<ReadinessLevel, number> = {
  green: 5,
  yellow: 3,
  red: 2,
};

export function riskAllowanceFor(readiness: ReadinessLevel): number {
  return RISK_ALLOWANCE[readiness];
}

/** Pain at or above this severity hard-excludes exercises that load the area. */
export const PAIN_EXCLUSION_SEVERITY = 3;

export interface CandidateContext {
  /** Open pain flags; locations must use the BODY_AREAS vocabulary. */
  painFlags: PainSignal[];
  readiness: ReadinessLevel;
  /** Omit for the user's fully-equipped gym; set to restrict (travel, home). */
  availableEquipment?: Equipment[] | null;
  /** Library ids the user has said are "not for me" — never offered. */
  excludedExerciseIds?: string[];
  /**
   * Areas the user asked to protect in their setup (Phase 15). Not pain
   * — nothing is excluded — but every exercise that loads one carries a
   * caution the coach must respect.
   */
  protectAreas?: string[];
}

export interface Candidate {
  exercise: ExerciseDefinition;
  /** Non-blocking warnings the AI must respect (mild pain, caution areas). */
  cautions: string[];
}

function formatArea(area: string): string {
  return area.replace(/_/g, " ");
}

export function filterCandidates(
  exercises: ExerciseDefinition[],
  section: TemplateSection,
  context: CandidateContext,
): Candidate[] {
  const equipmentSet = context.availableEquipment
    ? new Set<string>(context.availableEquipment)
    : null;
  const riskAllowance = RISK_ALLOWANCE[context.readiness];
  const ruledOut = new Set(context.excludedExerciseIds ?? []);

  const candidates: Candidate[] = [];
  for (const exercise of exercises) {
    if (ruledOut.has(exercise.id)) continue;
    if (!exercise.placements.some((p) => section.placements.includes(p))) {
      continue;
    }
    if (
      section.patterns?.length &&
      !section.patterns.includes(exercise.movementPattern)
    ) {
      continue;
    }
    if (
      section.categories?.length &&
      !section.categories.includes(exercise.category)
    ) {
      continue;
    }
    if (
      section.bodyRegions?.length &&
      !section.bodyRegions.includes(exercise.bodyRegion)
    ) {
      continue;
    }
    if (
      section.maxRecoveryCost !== undefined &&
      exercise.recoveryCost > section.maxRecoveryCost
    ) {
      continue;
    }
    if (exercise.riskLevel > riskAllowance) continue;
    if (equipmentSet && !exercise.equipment.every((e) => equipmentSet.has(e))) {
      continue;
    }

    const cautions: string[] = [];
    let excluded = false;
    for (const flag of context.painFlags) {
      const avoided = exercise.avoidAreas?.includes(
        flag.location as (typeof exercise.avoidAreas)[number],
      );
      const cautioned = exercise.cautionAreas?.includes(
        flag.location as (typeof exercise.cautionAreas)[number],
      );
      if (avoided && flag.severity >= PAIN_EXCLUSION_SEVERITY) {
        excluded = true;
        break;
      }
      if (avoided || cautioned) {
        cautions.push(
          flag.severity >= PAIN_EXCLUSION_SEVERITY
            ? `Moderate ${formatArea(flag.location)} pain — reduce load or range, and swap it if it aggravates.`
            : `Mild ${formatArea(flag.location)} pain — keep loading gentle and stop if it sharpens.`,
        );
      }
    }
    if (excluded) continue;

    // One line for every area the setup protects, not one each: two
    // near-identical sentences under a stretch read as a wall of text.
    const protect = (context.protectAreas ?? []).filter((area) => {
      const loads =
        exercise.avoidAreas?.includes(area as (typeof exercise.avoidAreas)[number]) ||
        exercise.cautionAreas?.includes(area as (typeof exercise.cautionAreas)[number]);
      return loads && !context.painFlags.some((flag) => flag.location === area);
    });
    if (protect.length > 0) {
      cautions.push(
        `Go gently on your ${formatList(protect.map(formatArea))}: controlled range, no grinding reps.`,
      );
    }

    candidates.push({ exercise, cautions });
  }
  return candidates;
}

export interface SectionCandidates {
  section: TemplateSection;
  candidates: Candidate[];
}

/**
 * Candidates for every section of a template. Sections that come back
 * empty are the caller's signal to drop the section (if optional) or
 * fall back — never to invent an exercise.
 */
export function buildSessionCandidates(
  template: SessionTemplate,
  exercises: ExerciseDefinition[],
  context: CandidateContext,
): SectionCandidates[] {
  return template.sections.map((section) => ({
    section,
    candidates: filterCandidates(exercises, section, context),
  }));
}
