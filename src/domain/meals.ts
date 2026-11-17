/**
 * Meal library vocabulary and types (Phase 3 design, playbook doc 04).
 *
 * The load-bearing distinction is `activeMinutes` (hands-on, over the
 * stove) versus `totalMinutes` (oven, slow cooker, unattended). Doc 04:
 * the barrier is not taste or total time, it's time demanding direct
 * attention.
 *
 * Everything in the library is dairy-free by construction, so it suits
 * anyone; dietary rules beyond that are the user's setup (Phase 15).
 */

export const MEAL_SLOTS = ["dinner", "lunch"] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];

export const COOK_METHODS = [
  "oven",
  "air_fryer",
  "hob",
  "slow_cooker",
  "grill",
  "no_cook",
] as const;
export type CookMethod = (typeof COOK_METHODS)[number];

/** How much of the cook demands standing over it. */
export const ATTENTION_LEVELS = ["low", "medium", "high"] as const;
export type AttentionLevel = (typeof ATTENTION_LEVELS)[number];

export const PROTEIN_FOCUS = [
  "chicken",
  "beef",
  "pork",
  "fish",
  "eggs",
  "legumes",
  "tofu",
  "mixed",
] as const;
export type ProteinFocus = (typeof PROTEIN_FOCUS)[number];

/**
 * Ingredient keys used by both the library and the pantry. Deliberately
 * coarse — "chicken thighs", not a brand or a weight — because the
 * pantry is hand-maintained and precision would cost the user time.
 */
const CUPBOARD = [
  // staples (doc 04: regular household staples)
  "rice",
  "pasta",
  "noodles",
  "potatoes",
  "sweet_potatoes",
  "couscous",
  "tortillas",
  "bread",
  "oats",
  "oat_milk",
  "stock",
  "tinned_tomatoes",
  "coconut_milk",
  "tinned_beans",
  "chickpeas",
  "lentils",
  "olive_oil",
  "soy_sauce",
  "curry_paste",
  "harissa",
  "peanut_butter",
  "honey",
  "seasonings",
  "garlic",
  "ginger",
  "onions",
] as const;

const PROTEINS = [
  "chicken_thighs",
  "chicken_breast",
  "beef_mince",
  "steak",
  "pork",
  "salmon",
  "white_fish",
  "prawns",
  "eggs",
  "tofu",
  "bacon",
  "sausages",
] as const;

const PRODUCE = [
  "peppers",
  "courgette",
  "aubergine",
  "broccoli",
  "green_beans",
  "spinach",
  "salad",
  "tomatoes",
  "cucumber",
  "carrots",
  "mushrooms",
  "frozen_veg",
  "lemon",
  "lime",
  "avocado",
  "herbs",
] as const;

/**
 * Order matters: it's cupboard, then the meat counter, then the veg
 * aisle, so a derived shopping list reads in roughly the order the shop
 * gets walked rather than alphabetically.
 */
export const INGREDIENTS = [...CUPBOARD, ...PROTEINS, ...PRODUCE] as const;
export type Ingredient = (typeof INGREDIENTS)[number];

/**
 * Where something lives in the shop and the kitchen. Built-in
 * ingredients have a fixed aisle; ones the user adds (Phase 13) pick
 * one, so a shopping list still reads in walking order.
 */
export const AISLES = ["cupboard", "protein", "produce", "other"] as const;
export type Aisle = (typeof AISLES)[number];

export const AISLE_LABELS: Record<Aisle, string> = {
  cupboard: "Cupboard",
  protein: "Meat, fish and eggs",
  produce: "Fridge and veg",
  other: "Everything else",
};

/** The built-in vocabulary, laid out the way a kitchen is. */
export const INGREDIENT_GROUPS = [
  { aisle: "cupboard", label: AISLE_LABELS.cupboard, ingredients: CUPBOARD },
  { aisle: "protein", label: AISLE_LABELS.protein, ingredients: PROTEINS },
  { aisle: "produce", label: AISLE_LABELS.produce, ingredients: PRODUCE },
] as const;

export function builtInAisle(key: string): Aisle | null {
  for (const group of INGREDIENT_GROUPS) {
    if ((group.ingredients as readonly string[]).includes(key)) return group.aisle;
  }
  return null;
}

/**
 * "Gochujang paste " → "gochujang_paste". Ingredients are keyed by a
 * plain slug so the user's own sit alongside the built-in ones and
 * display through the same formatIngredient. Null when nothing usable
 * is left.
 */
export function ingredientKey(label: string): string | null {
  const key = label
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s_-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 40)
    .replace(/^_|_$/g, "");
  return key.length >= 2 ? key : null;
}

/** A well-formed ingredient key, built-in or the user's own. */
export function isIngredientKey(value: string): boolean {
  return /^[a-z0-9]+(_[a-z0-9]+)*$/.test(value) && value.length <= 40;
}

/**
 * Walking order for a shopping list: built-ins in their curated order,
 * the user's own at the end of their aisle, unknowns last.
 */
export function shelfOrder(key: string, customAisles?: ReadonlyMap<string, Aisle>): number {
  const index = (INGREDIENTS as readonly string[]).indexOf(key);
  if (index !== -1) return index;
  const aisle = customAisles?.get(key) ?? "other";
  let end = 0;
  for (const group of INGREDIENT_GROUPS) {
    end += group.ingredients.length;
    if (group.aisle === aisle) return end - 0.5;
  }
  return INGREDIENTS.length + 1;
}

export interface MealDefinition {
  id: string;
  name: string;
  /** One line: what it is and why it's easy. */
  description: string;
  slots: MealSlot[];
  /** Hands-on minutes — the number that decides whether this happens. */
  activeMinutes: number;
  totalMinutes: number;
  attention: AttentionLevel;
  methods: CookMethod[];
  /**
   * Must be present (or bought) for the meal to work. Ingredient keys:
   * the built-in vocabulary for library meals, any key for the user's.
   */
  coreIngredients: string[];
  /** Improves it, but the meal survives without. */
  flexIngredients?: string[];
  proteinFocus: ProteinFocus;
  /** Scales up to leave lunch portions (doc 04: the takeaway-lunch defence). */
  batchFriendly: boolean;
  freezerFriendly: boolean;
  /** 3–6 short steps; enough to cook from without a recipe site. */
  steps: string[];
  tags?: string[];
}

export function isIngredient(value: string): value is Ingredient {
  return (INGREDIENTS as readonly string[]).includes(value);
}

/** "chicken_thighs" → "chicken thighs" */
export function formatIngredient(ingredient: string): string {
  return ingredient.replace(/_/g, " ");
}

/**
 * "a", "a and b", "a, b and c" — joining three things with "and" twice
 * reads like a shopping mumble, and this copy is read while hungry.
 */
export function formatList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** Ids of the user's own meals; library ids never start with this. */
export const USER_MEAL_PREFIX = "my_";

export interface UserMealInput {
  name: string;
  description?: string;
  slots: MealSlot[];
  activeMinutes: number;
  totalMinutes: number;
  proteinFocus: ProteinFocus;
  coreIngredients: string[];
  flexIngredients?: string[];
  batchFriendly: boolean;
  freezerFriendly: boolean;
  steps?: string[];
}

/**
 * Turns what the user entered into a meal the planners can use exactly
 * like a library one (Phase 13). Attention is derived from hands-on
 * time — asking for it would be one more field for a number that
 * already says it. Returns the problems instead when it can't.
 */
export function buildUserMeal(
  input: UserMealInput,
  id: string,
): { ok: true; meal: MealDefinition } | { ok: false; problems: string[] } {
  const problems: string[] = [];
  const name = input.name.trim().slice(0, 80);
  if (!name) problems.push("It needs a name.");
  const slots = MEAL_SLOTS.filter((slot) => input.slots.includes(slot));
  if (slots.length === 0) problems.push("Pick lunch, dinner or both.");
  const core = [...new Set(input.coreIngredients.filter(isIngredientKey))];
  if (core.length === 0) problems.push("Add at least one ingredient it can't do without.");
  const active = Math.round(input.activeMinutes);
  if (!Number.isFinite(active) || active < 0 || active > 240) {
    problems.push("Hands-on time should be between 0 and 240 minutes.");
  }
  if (!PROTEIN_FOCUS.includes(input.proteinFocus)) problems.push("Pick the main protein.");
  if (problems.length > 0) return { ok: false, problems };

  const total = Math.max(active, Math.min(Math.round(input.totalMinutes) || active, 600));
  const flex = [...new Set((input.flexIngredients ?? []).filter(isIngredientKey))].filter(
    (key) => !core.includes(key),
  );
  return {
    ok: true,
    meal: {
      id,
      name,
      description: input.description?.trim().slice(0, 200) ?? "",
      slots,
      activeMinutes: active,
      totalMinutes: total,
      attention: active <= 15 ? "low" : active <= 35 ? "medium" : "high",
      methods: [],
      coreIngredients: core,
      flexIngredients: flex,
      proteinFocus: input.proteinFocus,
      batchFriendly: input.batchFriendly,
      freezerFriendly: input.freezerFriendly,
      steps: (input.steps ?? []).map((step) => step.trim()).filter(Boolean).slice(0, 12),
      tags: ["own"],
    },
  };
}

/** "Mum's chilli" → "my_mums_chilli_k3x9" — readable, and never clashes. */
export function userMealId(name: string, suffix: string): string {
  const slug = ingredientKey(name) ?? "meal";
  return `${USER_MEAL_PREFIX}${slug.slice(0, 30)}_${suffix}`;
}
