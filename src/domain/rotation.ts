import type { ReadinessLevel } from "./readiness";
import {
  readinessAllows,
  TEMPLATES_BY_ID,
  type RotationEntry,
} from "./templates";

/**
 * Readiness-first rotation (Phase 2 design §3, doc 13): the AI decides
 * the next session from the rotation, not from weekdays — and there is
 * no calendar debt (decision D13: ceiling, not target).
 */

/**
 * Picks the next rotation entry: the least-recently-done session whose
 * template the current readiness allows. `recentKeys` is most-recent
 * first (e.g. from the last two weeks of completed workouts); entries
 * never done rank first, in rotation order.
 */
export function pickNextSession(
  rotation: RotationEntry[],
  recentKeys: string[],
  readiness: ReadinessLevel,
): RotationEntry {
  if (rotation.length === 0) {
    throw new Error("Rotation is empty");
  }

  const eligible = rotation.filter((entry) => {
    const template = TEMPLATES_BY_ID.get(entry.templateId);
    return template ? readinessAllows(readiness, template.minReadiness) : false;
  });
  // Every rotation should include a recovery entry, which allows red —
  // but never crash the daily loop over bad rotation data.
  const pool = eligible.length > 0 ? eligible : rotation;

  let best: RotationEntry = pool[0];
  let bestAge = -1;
  for (const entry of pool) {
    const index = recentKeys.indexOf(entry.key);
    const age = index === -1 ? Number.POSITIVE_INFINITY : index;
    if (age > bestAge) {
      best = entry;
      bestAge = age;
    }
  }
  return best;
}
