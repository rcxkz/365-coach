/**
 * Shortened-session selection (playbook doc 02: a late start gets
 * "a shortened 30-minute session", never "workout missed").
 *
 * Keeps exercises flagged for the short version in their original order;
 * if none are flagged, keeps the first three so a usable session always
 * exists.
 */
export function shortenWorkout<T extends { inShortVersion: boolean }>(
  exercises: T[],
): T[] {
  const flagged = exercises.filter((exercise) => exercise.inShortVersion);
  if (flagged.length > 0) return flagged;
  return exercises.slice(0, 3);
}
