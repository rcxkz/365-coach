import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "../db";
import {
  customIngredients,
  fuelDays,
  mealUserState,
  meals,
  pantryItems,
} from "../schema";
import {
  builtInAisle,
  isIngredient,
  isIngredientKey,
  USER_MEAL_PREFIX,
  type Aisle,
  type MealDefinition,
} from "../../domain/meals";
import { MEAL_LIBRARY } from "../library/meals";
import { mealFitsDiet } from "../../domain/profile";
import { avoidedIngredients, mealAvoids, withoutAvoided } from "../../domain/avoid";
import { INGREDIENTS } from "../../domain/meals";
import { getProfile } from "./profile";
import type { MealUserState, PantryItem } from "../../domain/meal-candidates";

export type MealRow = typeof meals.$inferSelect;
export type PantryRow = typeof pantryItems.$inferSelect;
export type FuelDay = typeof fuelDays.$inferSelect;

function toRow(meal: MealDefinition): typeof meals.$inferInsert {
  return {
    id: meal.id,
    name: meal.name,
    description: meal.description,
    slots: meal.slots,
    activeMinutes: meal.activeMinutes,
    totalMinutes: meal.totalMinutes,
    attention: meal.attention,
    methods: meal.methods,
    coreIngredients: meal.coreIngredients,
    flexIngredients: meal.flexIngredients ?? [],
    proteinFocus: meal.proteinFocus,
    batchFriendly: meal.batchFriendly,
    freezerFriendly: meal.freezerFriendly,
    steps: meal.steps,
    tags: meal.tags ?? [],
  };
}

/** Idempotent library sync — edits apply in place, user state survives. */
export async function upsertMeals(
  definitions: MealDefinition[],
): Promise<number> {
  if (definitions.length === 0) return 0;
  const db = await getDb();
  await db
    .insert(meals)
    .values(definitions.map(toRow))
    .onConflictDoUpdate({
      target: meals.id,
      set: {
        name: sql`excluded.name`,
        description: sql`excluded.description`,
        slots: sql`excluded.slots`,
        activeMinutes: sql`excluded.active_minutes`,
        totalMinutes: sql`excluded.total_minutes`,
        attention: sql`excluded.attention`,
        methods: sql`excluded.methods`,
        coreIngredients: sql`excluded.core_ingredients`,
        flexIngredients: sql`excluded.flex_ingredients`,
        proteinFocus: sql`excluded.protein_focus`,
        batchFriendly: sql`excluded.batch_friendly`,
        freezerFriendly: sql`excluded.freezer_friendly`,
        steps: sql`excluded.steps`,
        tags: sql`excluded.tags`,
      },
    });
  return definitions.length;
}

function toDefinition(row: MealRow): MealDefinition {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    slots: row.slots as MealDefinition["slots"],
    activeMinutes: row.activeMinutes,
    totalMinutes: row.totalMinutes,
    attention: row.attention as MealDefinition["attention"],
    methods: row.methods as MealDefinition["methods"],
    coreIngredients: row.coreIngredients,
    flexIngredients: row.flexIngredients,
    proteinFocus: row.proteinFocus as MealDefinition["proteinFocus"],
    batchFriendly: row.batchFriendly,
    freezerFriendly: row.freezerFriendly,
    steps: row.steps,
    tags: row.tags,
  };
}

/** The user's own meals (Phase 13), newest-named first by name. */
export async function listUserMeals(): Promise<MealDefinition[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(meals)
    .where(and(eq(meals.source, "user"), isNull(meals.archivedAt)))
    .orderBy(asc(meals.name));
  return rows.map(toDefinition);
}

/**
 * Every meal the planners may offer: the code library plus the user's
 * own. The library is read from code so it never depends on a sync
 * having run; the user's come from the database.
 */
export async function listAllMeals(): Promise<MealDefinition[]> {
  return [...MEAL_LIBRARY, ...(await listUserMeals())];
}

/**
 * The meals the planners may offer under the user's dietary rules
 * (Phase 15) — the library plus their own, minus anything a rule rules
 * out. Display screens use listAllMeals; planners use this.
 */
export async function listMealsForDiet(): Promise<MealDefinition[]> {
  const [all, { profile }] = await Promise.all([listAllMeals(), getProfile()]);
  const avoided = avoidedFrom(profile.food.avoid, all);
  return all
    .filter((meal) => mealFitsDiet(meal, profile.food.diet) && mealAvoids(meal, avoided))
    .map((meal) => withoutAvoided(meal, avoided));
}

/** Every ingredient key the app knows: the vocabulary plus any in the meals. */
function knownIngredients(meals: MealDefinition[]): string[] {
  const keys = new Set<string>(INGREDIENTS);
  for (const meal of meals) {
    for (const key of [...meal.coreIngredients, ...(meal.flexIngredients ?? [])]) keys.add(key);
  }
  return [...keys];
}

const avoidedFrom = (note: string, meals: MealDefinition[]) =>
  note ? avoidedIngredients(note, knownIngredients(meals)) : [];

/**
 * What "Anything else to leave out?" rules out right now, so the setup
 * screen can say it back ("That leaves out oats and oat milk").
 */
export async function avoidedIngredientKeys(note?: string): Promise<string[]> {
  const [all, { profile }] = await Promise.all([listAllMeals(), getProfile()]);
  return avoidedFrom(note ?? profile.food.avoid, all);
}

/** Meals as the shop should see them: nice-to-haves that are ruled out, dropped. */
export async function trimAvoided(meals: MealDefinition[]): Promise<MealDefinition[]> {
  const avoided = await avoidedIngredientKeys();
  return meals.map((meal) => withoutAvoided(meal, avoided));
}

/** A meal by id, library or the user's — archived ones included, for history. */
export async function getMealDefinition(id: string): Promise<MealDefinition | null> {
  const library = MEAL_LIBRARY.find((meal) => meal.id === id);
  if (library) return library;
  const row = await getMeal(id);
  return row ? toDefinition(row) : null;
}

/** Creates or replaces one of the user's meals. */
export async function saveUserMeal(meal: MealDefinition): Promise<void> {
  if (!meal.id.startsWith(USER_MEAL_PREFIX)) {
    throw new Error(`Not a user meal id: ${meal.id}`);
  }
  const db = await getDb();
  const row = { ...toRow(meal), source: "user", archivedAt: null };
  await db
    .insert(meals)
    .values(row)
    .onConflictDoUpdate({ target: meals.id, set: row });
}

/** Removed from the user's meals; kept for history and references. */
export async function archiveUserMeal(id: string): Promise<void> {
  const db = await getDb();
  await db
    .update(meals)
    .set({ archivedAt: new Date() })
    .where(and(eq(meals.id, id), eq(meals.source, "user")));
}

export async function listMeals(): Promise<MealRow[]> {
  const db = await getDb();
  return db.select().from(meals).orderBy(asc(meals.id));
}

export async function getMeal(id: string): Promise<MealRow | null> {
  const db = await getDb();
  const [row] = await db.select().from(meals).where(eq(meals.id, id)).limit(1);
  return row ?? null;
}

export async function listMealUserState(): Promise<MealUserState[]> {
  const db = await getDb();
  const rows = await db.select().from(mealUserState);
  return rows.map((row) => ({
    mealId: row.mealId,
    makeAgain: row.makeAgain,
    lastCookedOn: row.lastCookedOn,
  }));
}

/** One-tap feedback after cooking (doc 04: "would you make this again?"). */
export async function recordMealFeedback(input: {
  mealId: string;
  cookedOn: string;
  makeAgain?: boolean | null;
  partnerLiked?: boolean | null;
  note?: string | null;
}): Promise<void> {
  const db = await getDb();
  await db
    .insert(mealUserState)
    .values({
      mealId: input.mealId,
      makeAgain: input.makeAgain ?? null,
      partnerLiked: input.partnerLiked ?? null,
      lastCookedOn: input.cookedOn,
      timesCooked: 1,
      note: input.note ?? null,
    })
    .onConflictDoUpdate({
      target: mealUserState.mealId,
      set: {
        ...(input.makeAgain !== undefined ? { makeAgain: input.makeAgain } : {}),
        ...(input.partnerLiked !== undefined
          ? { partnerLiked: input.partnerLiked }
          : {}),
        ...(input.note !== undefined ? { note: input.note } : {}),
        lastCookedOn: input.cookedOn,
        timesCooked: sql`${mealUserState.timesCooked} + 1`,
        updatedAt: new Date(),
      },
    });
}

/**
 * Sets the make-again preference on its own. Separate from
 * recordMealFeedback because rating a meal isn't cooking it again —
 * folding the two together would inflate timesCooked every time someone
 * changed their mind.
 */
export async function setMealPreference(
  mealId: string,
  makeAgain: boolean,
): Promise<void> {
  const db = await getDb();
  await db
    .insert(mealUserState)
    .values({ mealId, makeAgain })
    .onConflictDoUpdate({
      target: mealUserState.mealId,
      set: { makeAgain, updatedAt: new Date() },
    });
}

export async function listPantry(): Promise<PantryRow[]> {
  const db = await getDb();
  return db
    .select()
    .from(pantryItems)
    .where(isNull(pantryItems.removedAt))
    .orderBy(asc(pantryItems.ingredient));
}

export type CustomIngredient = typeof customIngredients.$inferSelect;

export async function listCustomIngredients(): Promise<CustomIngredient[]> {
  const db = await getDb();
  return db.select().from(customIngredients).orderBy(asc(customIngredients.key));
}

/** Aisle per user-added ingredient, for shelf order and the kitchen screen. */
export async function customAisles(): Promise<Map<string, Aisle>> {
  return new Map((await listCustomIngredients()).map((row) => [row.key, row.aisle]));
}

/**
 * Adds the user's own ingredient. Built-in keys are already known and
 * aren't duplicated; an existing custom one keeps its aisle unless a new
 * one is given.
 */
export async function addCustomIngredient(key: string, aisle: Aisle): Promise<boolean> {
  if (!isIngredientKey(key)) throw new Error(`Not an ingredient key: ${key}`);
  if (builtInAisle(key)) return false;
  const db = await getDb();
  await db
    .insert(customIngredients)
    .values({ key, aisle })
    .onConflictDoUpdate({ target: customIngredients.key, set: { aisle } });
  return true;
}

/** Built-in or added by the user — the things a pantry or meal can hold. */
export async function isKnownIngredient(key: string): Promise<boolean> {
  if (isIngredient(key)) return true;
  if (!isIngredientKey(key)) return false;
  const db = await getDb();
  const [row] = await db
    .select({ key: customIngredients.key })
    .from(customIngredients)
    .where(eq(customIngredients.key, key))
    .limit(1);
  return Boolean(row);
}

export async function pantryForPlanning(): Promise<PantryItem[]> {
  const rows = await listPantry();
  return rows.map((row) => ({
    ingredient: row.ingredient,
    useByDate: row.useByDate,
  }));
}

export async function addPantryItem(input: {
  ingredient: string;
  note?: string | null;
  useByDate?: string | null;
}): Promise<PantryRow> {
  if (!(await isKnownIngredient(input.ingredient))) {
    throw new Error(`Unknown ingredient: ${input.ingredient}`);
  }
  const db = await getDb();
  // Re-adding something already in simply refreshes it.
  const [existing] = await db
    .select()
    .from(pantryItems)
    .where(
      and(
        isNull(pantryItems.removedAt),
        eq(pantryItems.ingredient, input.ingredient),
      ),
    )
    .limit(1);

  if (existing) {
    const [row] = await db
      .update(pantryItems)
      .set({
        note: input.note ?? existing.note,
        useByDate: input.useByDate ?? existing.useByDate,
        // Bought again, so no longer low.
        runningLow: false,
      })
      .where(eq(pantryItems.id, existing.id))
      .returning();
    return row;
  }

  const [row] = await db
    .insert(pantryItems)
    .values({
      ingredient: input.ingredient,
      note: input.note ?? null,
      useByDate: input.useByDate ?? null,
    })
    .returning();
  return row;
}

/**
 * Sets the kitchen to exactly what was ticked (decision K4). A diff
 * rather than an append: what's ticked is in, what isn't gets soft
 * removed, so the screen always shows the truth rather than an
 * ever-growing list nobody prunes.
 *
 * One call for the whole kitchen is the point — the old one-at-a-time
 * form cost a page load per ingredient, which is why the pantry got
 * stocked once and then wiped.
 */
export async function setPantry(
  items: (string | { ingredient: string; runningLow?: boolean })[],
): Promise<{ added: number; removed: number }> {
  const wanted = new Map<string, boolean>();
  for (const item of items) {
    const { ingredient, runningLow = false } =
      typeof item === "string" ? { ingredient: item } : item;
    if (await isKnownIngredient(ingredient)) wanted.set(ingredient, runningLow);
  }
  const current = await listPantry();
  const held = new Map(current.map((row) => [row.ingredient, row]));

  const toRemove = current.filter((row) => !wanted.has(row.ingredient));
  const toAdd = [...wanted.keys()].filter((ingredient) => !held.has(ingredient));
  const toFlag = current.filter(
    (row) => wanted.has(row.ingredient) && wanted.get(row.ingredient) !== row.runningLow,
  );

  const db = await getDb();
  if (toRemove.length > 0) {
    await db
      .update(pantryItems)
      .set({ removedAt: new Date() })
      .where(
        inArray(
          pantryItems.id,
          toRemove.map((row) => row.id),
        ),
      );
  }
  if (toAdd.length > 0) {
    await db.insert(pantryItems).values(
      toAdd.map((ingredient) => ({
        ingredient,
        runningLow: wanted.get(ingredient) ?? false,
      })),
    );
  }
  for (const row of toFlag) {
    await db
      .update(pantryItems)
      .set({ runningLow: wanted.get(row.ingredient) ?? false })
      .where(eq(pantryItems.id, row.id));
  }

  return { added: toAdd.length, removed: toRemove.length };
}

/** Used up or gone off — soft removal keeps the history honest. */
export async function removePantryItem(id: number): Promise<void> {
  const db = await getDb();
  await db
    .update(pantryItems)
    .set({ removedAt: new Date() })
    .where(eq(pantryItems.id, id));
}

export async function getFuelDay(date: string): Promise<FuelDay | null> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(fuelDays)
    .where(eq(fuelDays.date, date))
    .limit(1);
  return row ?? null;
}

export async function saveFuelDay(input: {
  date: string;
  dinnerMealId: string | null;
  dinnerReason: string | null;
  alternativeMealId: string | null;
  alternativeReason: string | null;
  mode: "ai" | "rules";
}): Promise<FuelDay> {
  const db = await getDb();
  const [row] = await db
    .insert(fuelDays)
    .values(input)
    .onConflictDoUpdate({
      target: fuelDays.date,
      set: {
        dinnerMealId: input.dinnerMealId,
        dinnerReason: input.dinnerReason,
        alternativeMealId: input.alternativeMealId,
        alternativeReason: input.alternativeReason,
        mode: input.mode,
        createdAt: new Date(),
      },
    })
    .returning();
  return row;
}

/** The takeaway-lunch defence, made visible before hunger arrives. */
export async function setLunchSorted(
  date: string,
  sorted: boolean,
  note?: string | null,
): Promise<void> {
  const db = await getDb();
  await db
    .insert(fuelDays)
    .values({
      date,
      lunchSorted: sorted,
      lunchNote: note ?? null,
      dinnerMealId: null,
      alternativeMealId: null,
      mode: "rules",
    })
    .onConflictDoUpdate({
      target: fuelDays.date,
      set: { lunchSorted: sorted, ...(note !== undefined ? { lunchNote: note } : {}) },
    });
}

export async function recentFuelDays(limit = 7): Promise<FuelDay[]> {
  const db = await getDb();
  return db.select().from(fuelDays).orderBy(desc(fuelDays.date)).limit(limit);
}

/** Meals marked "not again", for the list that can bring them back. */
export async function listRuledOutMeals(): Promise<{ id: string; name: string }[]> {
  const db = await getDb();
  return db
    .select({ id: meals.id, name: meals.name })
    .from(mealUserState)
    .innerJoin(meals, eq(meals.id, mealUserState.mealId))
    .where(eq(mealUserState.makeAgain, false))
    .orderBy(meals.name);
}

/** Back to unrated: suggested again, and asked about after cooking. */
export async function clearMealPreference(mealId: string): Promise<void> {
  const db = await getDb();
  await db
    .update(mealUserState)
    .set({ makeAgain: null, updatedAt: new Date() })
    .where(eq(mealUserState.mealId, mealId));
}
