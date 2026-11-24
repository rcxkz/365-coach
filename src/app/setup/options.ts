import { BODY_AREAS } from "@/domain/exercises";
import type { Profile } from "@/domain/profile";
import { PLANS } from "@/domain/templates";

/**
 * The setup answers, in one place: the setup form draws its chips from
 * these, and Settings uses the same labels to show what's chosen.
 */
export type ChoiceOption = { value: string; label: string };

export const MODULE_OPTIONS: ChoiceOption[] = [
  { value: "train", label: "Training" },
  { value: "fuel", label: "Food" },
  { value: "journal", label: "How I feel" },
];

export const EXPERIENCE_OPTIONS: ChoiceOption[] = [
  { value: "new", label: "New to it" },
  { value: "some", label: "Some" },
  { value: "experienced", label: "Experienced" },
];

export const RETURNING_OPTIONS: ChoiceOption[] = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

export const DAYS_OPTIONS: ChoiceOption[] = [2, 3, 4, 5, 6].map((n) => ({
  value: String(n),
  label: String(n),
}));

export const MINUTES_OPTIONS: ChoiceOption[] = [30, 45, 60, 75].map((n) => ({
  value: String(n),
  label: `${n} min`,
}));

export const EQUIPMENT_OPTIONS: ChoiceOption[] = [
  { value: "full_gym", label: "A full gym" },
  { value: "home", label: "Home — dumbbells, bands, a bar" },
  { value: "bodyweight", label: "Bodyweight only" },
];

export const area = (key: string) => key.replace(/_/g, " ");

export const PROTECT_OPTIONS: ChoiceOption[] = BODY_AREAS.map((key) => ({
  value: key,
  label: area(key),
}));

export const DIET_OPTIONS: ChoiceOption[] = [
  { value: "dairy_free", label: "Dairy-free" },
  { value: "vegetarian", label: "Vegetarian" },
  { value: "vegan", label: "Vegan" },
  { value: "pescatarian", label: "Pescatarian" },
  { value: "gluten_free", label: "Gluten-free" },
];

export const HOUSEHOLD_OPTIONS: ChoiceOption[] = [1, 2, 3, 4, 5].map((n) => ({
  value: String(n),
  label: n === 1 ? "Just me" : n === 5 ? "5+" : String(n),
}));

export const HABIT_OPTIONS: ChoiceOption[] = [
  { value: "takeaway_lunches", label: "Takeaway lunches" },
  { value: "skipping_meals", label: "Skipping meals" },
  { value: "snacking", label: "Snacking" },
  { value: "none", label: "Nothing in particular" },
];

const labelOf = (options: ChoiceOption[], value: string) =>
  options.find((option) => option.value === value)?.label ?? value;

const list = (labels: string[], none: string) => (labels.length ? labels.join(", ") : none);

/** Each setup answer as a line of text, grouped like the setup form. */
export function setupSummary(profile: Profile) {
  const parts = MODULE_OPTIONS.filter((o) => profile.modules[o.value as keyof Profile["modules"]]);
  const { training, food } = profile;
  return {
    parts: list(
      parts.map((o) => o.label),
      "Nothing switched on",
    ),
    training: [
      { label: "Plan", value: PLANS[training.plan].label },
      { label: "Days a week", value: `Up to ${training.daysPerWeek}` },
      { label: "Time per session", value: `${training.sessionMinutes} min` },
      { label: "Where you train", value: labelOf(EQUIPMENT_OPTIONS, training.equipment) },
      {
        label: "Experience",
        value: `${labelOf(EXPERIENCE_OPTIONS, training.experience)}${training.returning ? ", coming back after time off" : ""}`,
      },
      { label: "Looking after", value: list(profile.protect.map(area), "Nothing in particular") },
    ],
    food: [
      { label: "Rules", value: list(food.diet.map((d) => labelOf(DIET_OPTIONS, d)), "None") },
      { label: "Cooking for", value: labelOf(HOUSEHOLD_OPTIONS, String(food.householdSize)) },
      { label: "Habit to beat", value: labelOf(HABIT_OPTIONS, food.habit) },
    ],
  };
}
