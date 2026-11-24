import { BODY_AREAS, type BodyArea, type Equipment } from "./exercises";
import { normaliseAvoid } from "./avoid";
import type { MealDefinition } from "./meals";
import { PLAN_STYLES, type PlanStyle } from "./templates";

/**
 * The user's own setup (Phase 15): what they train for, what they have,
 * what to protect, how they eat, and which parts of the app they want.
 * One per deployment — each person runs their own app — so there are no
 * accounts, just this. Pure: the data layer stores it, everything else
 * reads it through these helpers.
 */

export const MODULES = ["train", "fuel", "journal"] as const;
export type Module = (typeof MODULES)[number];

export const EQUIPMENT_SETUPS = ["full_gym", "home", "bodyweight"] as const;
export type EquipmentSetup = (typeof EQUIPMENT_SETUPS)[number];

export const SESSION_LENGTHS = [30, 45, 60, 75] as const;

export const EXPERIENCE_LEVELS = ["new", "some", "experienced"] as const;
export type Experience = (typeof EXPERIENCE_LEVELS)[number];

export const DIET_RULES = [
  "dairy_free",
  "vegetarian",
  "vegan",
  "pescatarian",
  "gluten_free",
] as const;
export type DietRule = (typeof DIET_RULES)[number];

export const FOOD_HABITS = ["takeaway_lunches", "skipping_meals", "snacking", "none"] as const;
export type FoodHabit = (typeof FOOD_HABITS)[number];

export const BUILT_IN_TRACKERS = ["mood", "stress", "energy", "soreness", "digestion"] as const;
export type BuiltInTracker = (typeof BUILT_IN_TRACKERS)[number];

export const TRACKER_KINDS = ["scale", "yesno", "number"] as const;
export type TrackerKind = (typeof TRACKER_KINDS)[number];

/** Something the user chose to track in their journal (Phase 15). */
export interface CustomTracker {
  id: string;
  label: string;
  kind: TrackerKind;
  /** For numbers: "steps", "glasses", "hours". */
  unit: string;
}

export const MAX_CUSTOM_TRACKERS = 8;

export interface Profile {
  /** First name, for a human greeting. Optional. */
  name: string;
  modules: Record<Module, boolean>;
  training: {
    plan: PlanStyle;
    experience: Experience;
    /** Coming back after time off — the ramp and the coach's tone follow. */
    returning: boolean;
    daysPerWeek: number;
    sessionMinutes: (typeof SESSION_LENGTHS)[number];
    equipment: EquipmentSetup;
  };
  /** Body areas to treat with care in every session, pain or not. */
  protect: BodyArea[];
  food: {
    diet: DietRule[];
    /** "Anything else to leave out?", in their words (Phase 18). */
    avoid: string;
    householdSize: number;
    habit: FoodHabit;
  };
  journal: {
    /** Built-in trackers switched off — hidden from the journal. */
    hidden: BuiltInTracker[];
    custom: CustomTracker[];
  };
}

/** A sensible blank: everything on, a full gym, no special rules. */
export const DEFAULT_PROFILE: Profile = {
  name: "",
  modules: { train: true, fuel: true, journal: true },
  training: {
    plan: "rebuild",
    experience: "some",
    returning: false,
    daysPerWeek: 4,
    sessionMinutes: 60,
    equipment: "full_gym",
  },
  protect: [],
  food: { diet: [], avoid: "", householdSize: 1, habit: "none" },
  journal: { hidden: [], custom: [] },
};

const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;

const clampInt = (value: unknown, min: number, max: number, fallback: number) => {
  const n = Number(value);
  return Number.isInteger(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

/**
 * Whatever was stored or submitted, made into a valid profile: unknown
 * values fall back to the defaults rather than failing, so an older
 * stored shape never breaks the app.
 */
export function normaliseProfile(input: unknown): Profile {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const modules = (raw.modules ?? {}) as Record<string, unknown>;
  const training = (raw.training ?? {}) as Record<string, unknown>;
  const food = (raw.food ?? {}) as Record<string, unknown>;
  const journal = (raw.journal ?? {}) as Record<string, unknown>;
  const d = DEFAULT_PROFILE;

  const sessionMinutes = Number(training.sessionMinutes);
  return {
    name: typeof raw.name === "string" ? raw.name.trim().slice(0, 40) : "",
    modules: {
      train: modules.train !== undefined ? Boolean(modules.train) : d.modules.train,
      fuel: modules.fuel !== undefined ? Boolean(modules.fuel) : d.modules.fuel,
      journal: modules.journal !== undefined ? Boolean(modules.journal) : d.modules.journal,
    },
    training: {
      plan: pick(training.plan, PLAN_STYLES, d.training.plan),
      experience: pick(training.experience, EXPERIENCE_LEVELS, d.training.experience),
      returning: Boolean(training.returning),
      daysPerWeek: clampInt(training.daysPerWeek, 2, 7, d.training.daysPerWeek),
      sessionMinutes: (SESSION_LENGTHS as readonly number[]).includes(sessionMinutes)
        ? (sessionMinutes as Profile["training"]["sessionMinutes"])
        : d.training.sessionMinutes,
      equipment: pick(training.equipment, EQUIPMENT_SETUPS, d.training.equipment),
    },
    protect: [
      ...new Set(
        (Array.isArray(raw.protect) ? raw.protect : []).filter((area): area is BodyArea =>
          (BODY_AREAS as readonly string[]).includes(area as string),
        ),
      ),
    ],
    food: {
      diet: [
        ...new Set(
          (Array.isArray(food.diet) ? food.diet : []).filter((rule): rule is DietRule =>
            (DIET_RULES as readonly string[]).includes(rule as string),
          ),
        ),
      ],
      avoid: normaliseAvoid(food.avoid),
      householdSize: clampInt(food.householdSize, 1, 8, d.food.householdSize),
      habit: pick(food.habit, FOOD_HABITS, d.food.habit),
    },
    journal: {
      hidden: [
        ...new Set(
          (Array.isArray(journal.hidden) ? journal.hidden : []).filter(
            (key): key is BuiltInTracker => (BUILT_IN_TRACKERS as readonly string[]).includes(key as string),
          ),
        ),
      ],
      custom: normaliseTrackers(journal.custom),
    },
  };
}

/**
 * What each equipment setup can use. Null means everything — the
 * library's own lists decide. Home and bodyweight are deliberately
 * generous with small kit people commonly own.
 */
export function availableEquipment(setup: EquipmentSetup): Equipment[] | null {
  switch (setup) {
    case "full_gym":
      return null;
    case "home":
      return [
        "bodyweight", "dumbbell", "kettlebell", "band", "bench", "pull_up_bar",
        "box", "foam_roller", "strap", "jump_rope",
      ];
    case "bodyweight":
      return ["bodyweight", "pull_up_bar", "band", "foam_roller", "strap", "jump_rope"];
  }
}

/** Ingredients each rule rules out. Coarse on purpose, like the vocabulary. */
const MEAT = [
  "chicken_thighs", "chicken_breast", "beef_mince", "steak", "pork", "bacon", "sausages",
];
const FISH = ["salmon", "white_fish", "prawns", "tuna", "smoked_salmon"];
const ANIMAL_OTHER = ["eggs", "honey"];
const GLUTEN = ["pasta", "noodles", "couscous", "tortillas", "bread", "soy_sauce", "oats", "granola"];
const DAIRY = ["milk", "butter", "cheese", "cream", "yoghurt"];

const EXCLUDED: Record<DietRule, string[]> = {
  dairy_free: DAIRY,
  vegetarian: [...MEAT, ...FISH],
  pescatarian: MEAT,
  vegan: [...MEAT, ...FISH, ...ANIMAL_OTHER, ...DAIRY],
  gluten_free: GLUTEN,
};

const EXCLUDED_PROTEIN: Partial<Record<DietRule, string[]>> = {
  vegetarian: ["chicken", "beef", "pork", "fish"],
  pescatarian: ["chicken", "beef", "pork"],
  vegan: ["chicken", "beef", "pork", "fish", "eggs"],
};

/**
 * Whether a meal can be offered under the user's dietary rules. Only
 * core ingredients count — a nice-to-have can simply be left out.
 */
export function mealFitsDiet(meal: MealDefinition, diet: DietRule[]): boolean {
  for (const rule of diet) {
    if (EXCLUDED_PROTEIN[rule]?.includes(meal.proteinFocus)) return false;
    if (meal.coreIngredients.some((ingredient) => EXCLUDED[rule].includes(ingredient))) {
      return false;
    }
  }
  return true;
}

/**
 * Days a week is a ceiling, never a quota (doc 10, D13): once the week
 * holds that many trained days, the rest of it is rest. Nothing is ever
 * owed back — a short week simply ends.
 */
export function weeklyCeilingReached(
  trainedDates: string[],
  weekStart: string,
  targetDate: string,
  daysPerWeek: number,
): boolean {
  const thisWeek = new Set(trainedDates.filter((date) => date >= weekStart && date < targetDate));
  return thisWeek.size >= daysPerWeek;
}

function normaliseTrackers(input: unknown): CustomTracker[] {
  const seen = new Set<string>();
  const trackers: CustomTracker[] = [];
  for (const item of Array.isArray(input) ? input : []) {
    const raw = (item ?? {}) as Record<string, unknown>;
    const label = typeof raw.label === "string" ? raw.label.trim().slice(0, 30) : "";
    const id = typeof raw.id === "string" ? raw.id : "";
    if (!label || !/^[a-z0-9_]{1,40}$/.test(id) || seen.has(id)) continue;
    seen.add(id);
    trackers.push({
      id,
      label,
      kind: pick(raw.kind, TRACKER_KINDS, "scale"),
      unit: typeof raw.unit === "string" ? raw.unit.trim().slice(0, 15) : "",
    });
    if (trackers.length >= MAX_CUSTOM_TRACKERS) break;
  }
  return trackers;
}
