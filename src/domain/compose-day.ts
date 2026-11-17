export type DayActionDraft = {
  domain: "fitness" | "fuel" | "general";
  kind: "workout" | "food" | "reminder" | "checkin";
  title: string;
  detail?: string | null;
  rationale?: string | null;
  workoutId?: number | null;
  /** Set on a dinner action so ticking it records the meal as cooked. */
  mealId?: string | null;
};

/**
 * Composes the day's action list in playbook doc 09 priority order:
 * gym -> food -> reminders. (Project steps went with Mission, doc 06
 * descoped 23 October 2026.)
 */
export function composeDay(inputs: {
  workout?: DayActionDraft | null;
  foodActions?: DayActionDraft[];
  reminders?: DayActionDraft[];
}): DayActionDraft[] {
  const day: DayActionDraft[] = [];
  if (inputs.workout) day.push(inputs.workout);
  day.push(...(inputs.foodActions ?? []));
  day.push(...(inputs.reminders ?? []));
  return day;
}
