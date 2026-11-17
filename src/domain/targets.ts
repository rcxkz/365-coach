/**
 * What a set is counted in. Most exercises count reps, but holds and
 * carries are prescribed in seconds, minutes or metres ("20-45s",
 * "30m per side") — and logging those as "45 reps" made the log wrong.
 * The number is still stored in the set's `reps` column; this only
 * decides how it is labelled and stepped.
 */
export type SetUnit = "reps" | "seconds" | "minutes" | "metres";

export interface SetMeasure {
  unit: SetUnit;
  /** Stepper increment: one rep, but five seconds or metres. */
  step: number;
  format: (value: number) => string;
}

const MEASURES: Record<SetUnit, SetMeasure> = {
  reps: { unit: "reps", step: 1, format: (n) => `${n} ${n === 1 ? "rep" : "reps"}` },
  seconds: { unit: "seconds", step: 5, format: (n) => `${n}s` },
  minutes: { unit: "minutes", step: 1, format: (n) => `${n} min` },
  metres: { unit: "metres", step: 5, format: (n) => `${n}m` },
};

/**
 * The unit of the target's leading quantity. A count followed by a
 * tempo ("4-6 x 3-5s lowering") is still reps.
 */
export function measureFor(targetReps: string): SetMeasure {
  const lead = targetReps.trim().match(/^[\d\s-]+(min\b|s\b|m\b)?/i);
  const unit = lead?.[1]?.toLowerCase();
  if (unit === "min") return MEASURES.minutes;
  if (unit === "s") return MEASURES.seconds;
  if (unit === "m") return MEASURES.metres;
  return MEASURES.reps;
}

/**
 * Default value to log when the user taps a set to confirm it as
 * planned: the top of the leading range ("6-8" -> 8, "20-45s" -> 45),
 * so a plain tap means "done as prescribed"; the stepper handles
 * anything else. Later numbers ("at 80-90%", "x 3-5s lowering") are
 * detail, not the target — except a pattern like "4-4-4-4 x 10
 * cycles", where the count comes after the x.
 */
export function defaultRepsFor(targetReps: string): number {
  const text = targetReps.trim();
  const pattern = text.match(/^\d+(?:-\d+){2,}\s*x\s*(\d+)/);
  if (pattern) return Number(pattern[1]);
  const lead = text.match(/^(\d+)(?:\s*-\s*(\d+))?/);
  if (lead) return Number(lead[2] ?? lead[1]);
  const any = text.match(/\d+/g);
  return any ? Math.max(...any.map(Number)) : 1;
}
