import type { MealDefinition } from "./meals";

/**
 * "Anything else to leave out?" (Phase 18): the user writes it the way
 * they'd say it ("no oats, no tomatoes, nothing too spicy"). Whatever
 * names an ingredient becomes a hard rule here, so the rules-only path
 * honours it with no AI at all; the AI reads the whole note on top.
 *
 * Every word in the box counts as something to avoid: the box only asks
 * what to leave out, so "no" and "please" just match nothing.
 */
export const MAX_AVOID_LENGTH = 200;

/**
 * Words that are too general to rule anything out on their own. They
 * still count as part of a full name ("oat milk", "peanut butter"), so
 * "no butter" leaves out butter, not peanut butter.
 */
const QUALIFIERS = new Set([
  "tinned", "sweet", "white", "green", "frozen", "smoked", "olive", "oil",
  "paste", "sauce", "seed", "milk", "butter", "mince", "thigh", "breast", "veg",
]);

/** A few everyday words that cover more than one ingredient. */
const ALIASES: Record<string, string[]> = {
  pork: ["pork", "bacon", "sausages"],
  nut: ["peanut_butter"],
  peanut: ["peanut_butter"],
  shellfish: ["prawns"],
  seafood: ["prawns", "salmon", "white_fish", "tuna", "smoked_salmon"],
  fish: ["salmon", "white_fish", "tuna", "smoked_salmon"],
  egg: ["eggs"],
  chilli: ["harissa", "curry_paste"],
  spicy: ["harissa", "curry_paste"],
};

/** "Tomatoes" → "tomato", "berries" → "berry": plurals and singulars meet. */
function stem(word: string): string {
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && word.endsWith("oes")) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

function words(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z]+/)
    .filter(Boolean)
    .map(stem);
}

/** Keeps what's typed tidy and short; an older profile without it reads as "". */
export function normaliseAvoid(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, MAX_AVOID_LENGTH) : "";
}

/**
 * The ingredient keys the note rules out, from the keys the app knows
 * (the built-in vocabulary plus the user's own). A key is ruled out when
 * the note names it in full, or names its main word ("tomatoes" covers
 * tinned tomatoes too).
 */
export function avoidedIngredients(note: string, keys: readonly string[]): string[] {
  const said = words(note);
  if (said.length === 0) return [];
  const text = ` ${said.join(" ")} `;
  const known = new Set(keys);
  const out = new Set<string>();

  // Full names first, so "sweet potatoes" doesn't also mean potatoes.
  let rest = text;
  for (const key of [...keys].sort((a, b) => b.length - a.length)) {
    const name = ` ${key.split("_").map(stem).join(" ")} `;
    if (rest.includes(name)) {
      out.add(key);
      // A two-word name uses its words up; a one-word one ("oats")
      // still reaches the names it's part of ("oat milk").
      if (key.includes("_")) rest = rest.split(name).join(" ");
    }
  }

  const left = new Set(rest.split(" ").filter(Boolean));
  for (const key of keys) {
    const parts = key.split("_").map(stem);
    if (parts.some((part) => left.has(part) && !QUALIFIERS.has(part))) out.add(key);
  }
  for (const word of said) {
    for (const key of ALIASES[word] ?? []) if (known.has(key)) out.add(key);
  }
  return keys.filter((key) => out.has(key));
}

/** Whether a meal can still be made without anything the note rules out. */
export function mealAvoids(meal: MealDefinition, avoided: readonly string[]): boolean {
  return !meal.coreIngredients.some((ingredient) => avoided.includes(ingredient));
}

/** The meal with its nice-to-haves trimmed of anything ruled out. */
export function withoutAvoided(meal: MealDefinition, avoided: readonly string[]): MealDefinition {
  if (avoided.length === 0 || !meal.flexIngredients?.length) return meal;
  return { ...meal, flexIngredients: meal.flexIngredients.filter((key) => !avoided.includes(key)) };
}
