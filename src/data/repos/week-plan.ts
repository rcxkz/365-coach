import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import {
  addPantryItem,
  customAisles,
  isKnownIngredient,
  listAllMeals,
  listPantry,
} from "./fuel";
import { getDb } from "../db";
import { shoppingItems, weekPlanMeals } from "../schema";
import type { MealDefinition } from "../../domain/meals";
import { deriveShoppingList, type ShoppingList } from "../../domain/week-plan";

/**
 * The week's meal pool and its shopping list (Phase 6 design).
 *
 * Kept apart from `fuel.ts` because the two answer different questions
 * at different cadences: fuel is tonight, this is the shop.
 */

export type WeekPlanMealRow = typeof weekPlanMeals.$inferSelect;
export type ShoppingItemRow = typeof shoppingItems.$inferSelect;
export type ShoppingStatus = ShoppingItemRow["status"];

export async function listWeekPlan(
  weekStart: string,
): Promise<WeekPlanMealRow[]> {
  const db = await getDb();
  return db
    .select()
    .from(weekPlanMeals)
    .where(eq(weekPlanMeals.weekStart, weekStart))
    .orderBy(asc(weekPlanMeals.id));
}

/**
 * What's still available to cook — this is what makes the pool run
 * down. Pass a slot to count only dinners or only lunch preps.
 */
export async function uncookedWeekMeals(
  weekStart: string,
  slot?: "dinner" | "lunch",
): Promise<WeekPlanMealRow[]> {
  const db = await getDb();
  return db
    .select()
    .from(weekPlanMeals)
    .where(
      and(
        eq(weekPlanMeals.weekStart, weekStart),
        isNull(weekPlanMeals.cookedOn),
        slot ? eq(weekPlanMeals.slot, slot) : undefined,
      ),
    )
    .orderBy(asc(weekPlanMeals.id));
}

/**
 * Replaces the week's pool. Anything already cooked keeps its date if it
 * survives the re-plan — re-planning on Thursday shouldn't resurrect
 * Monday's dinner as still to do.
 */
export async function saveWeekPlan(
  weekStart: string,
  entries: { mealId: string; reason?: string | null; slot?: "dinner" | "lunch" }[],
): Promise<WeekPlanMealRow[]> {
  const db = await getDb();
  const existing = await listWeekPlan(weekStart);
  const cookedByMeal = new Map(
    existing
      .filter((row) => row.cookedOn)
      .map((row) => [row.mealId, row.cookedOn]),
  );

  await db.delete(weekPlanMeals).where(eq(weekPlanMeals.weekStart, weekStart));
  if (entries.length === 0) return [];

  return db
    .insert(weekPlanMeals)
    .values(
      entries.map((entry) => ({
        weekStart,
        mealId: entry.mealId,
        reason: entry.reason ?? null,
        slot: entry.slot ?? "dinner",
        cookedOn: cookedByMeal.get(entry.mealId) ?? null,
      })),
    )
    .returning();
}

export async function markWeekMealCooked(
  weekStart: string,
  mealId: string,
  cookedOn: string,
): Promise<void> {
  const db = await getDb();
  await db
    .update(weekPlanMeals)
    .set({ cookedOn })
    .where(
      and(
        eq(weekPlanMeals.weekStart, weekStart),
        eq(weekPlanMeals.mealId, mealId),
        isNull(weekPlanMeals.cookedOn),
      ),
    );
}

export async function removeWeekMeal(id: number): Promise<void> {
  const db = await getDb();
  await db.delete(weekPlanMeals).where(eq(weekPlanMeals.id, id));
}

export async function listShoppingList(
  weekStart: string,
): Promise<ShoppingItemRow[]> {
  const db = await getDb();
  return db
    .select()
    .from(shoppingItems)
    .where(eq(shoppingItems.weekStart, weekStart))
    .orderBy(asc(shoppingItems.id));
}

/**
 * Brings the stored list in line with what the pool now needs, without
 * losing the user's edits: ticked items stay ticked, "already got that"
 * stays, hand-added items are never touched. Only untouched derived
 * lines disappear when their meal leaves the week.
 */
export async function syncShoppingList(
  weekStart: string,
  ingredients: string[],
): Promise<ShoppingItemRow[]> {
  const db = await getDb();
  const existing = await listShoppingList(weekStart);
  const known = new Set(existing.map((row) => row.ingredient));

  const additions = ingredients.filter((ingredient) => !known.has(ingredient));
  if (additions.length > 0) {
    await db
      .insert(shoppingItems)
      .values(
        additions.map((ingredient) => ({
          weekStart,
          ingredient,
          source: "derived" as const,
        })),
      )
      .onConflictDoNothing();
  }

  const wanted = new Set(ingredients);
  const stale = existing
    .filter(
      (row) =>
        row.source === "derived" &&
        row.status === "needed" &&
        !wanted.has(row.ingredient),
    )
    .map((row) => row.id);
  if (stale.length > 0) {
    await db.delete(shoppingItems).where(inArray(shoppingItems.id, stale));
  }

  return listShoppingList(weekStart);
}


/** The week's pool as library definitions, in planned order. */
export async function weekPlanMealDefinitions(
  weekStart: string,
): Promise<MealDefinition[]> {
  const [rows, allMeals] = await Promise.all([listWeekPlan(weekStart), listAllMeals()]);
  const byId = new Map(allMeals.map((meal) => [meal.id, meal]));
  return rows
    .map((row) => byId.get(row.mealId))
    .filter((meal): meal is MealDefinition => Boolean(meal));
}

/**
 * Re-derives the list from whatever the pool now holds. Called after
 * planning and after a meal is dropped, so the list and the week can
 * never drift apart. Returns the full derivation because the optional
 * half is display-only and never stored.
 */
export async function refreshShoppingList(
  weekStart: string,
): Promise<ShoppingList> {
  const [pool, pantry, aisles] = await Promise.all([
    weekPlanMealDefinitions(weekStart),
    listPantry(),
    customAisles(),
  ]);
  const list = deriveShoppingList(
    pool,
    pantry.map((item) => item.ingredient),
    {
      runningLow: pantry.filter((item) => item.runningLow).map((item) => item.ingredient),
      customAisles: aisles,
    },
  );
  await syncShoppingList(
    weekStart,
    list.toBuy.map((line) => line.ingredient),
  );
  return list;
}

export async function setShoppingStatus(
  id: number,
  status: ShoppingStatus,
): Promise<void> {
  const db = await getDb();
  await db.update(shoppingItems).set({ status }).where(eq(shoppingItems.id, id));
}

/**
 * Hand-added lines are free text on purpose — a shopping list has to
 * hold "kitchen roll", which the meal vocabulary never will.
 */
export async function addShoppingItem(
  weekStart: string,
  ingredient: string,
): Promise<void> {
  const trimmed = ingredient.trim().toLowerCase().replace(/\s+/g, "_");
  if (!trimmed) return;
  const db = await getDb();
  await db
    .insert(shoppingItems)
    .values({ weekStart, ingredient: trimmed, source: "manual" })
    .onConflictDoNothing();
}

export async function removeShoppingItem(id: number): Promise<void> {
  const db = await getDb();
  await db.delete(shoppingItems).where(eq(shoppingItems.id, id));
}

/**
 * The load-bearing move (decision G6): what you bought becomes what's in
 * the house. The pantry stops being a ledger to maintain and becomes a
 * byproduct of shopping — which is the whole reason the last one was
 * stocked once and then wiped.
 *
 * Only vocabulary ingredients can enter the pantry; hand-added lines
 * like "kitchen roll" stay ticked on the list and go no further.
 */
export async function stockPantryFromShopping(
  weekStart: string,
): Promise<number> {
  const rows = await listShoppingList(weekStart);
  const bought = [];
  for (const row of rows) {
    if (row.status === "bought" && (await isKnownIngredient(row.ingredient))) {
      bought.push(row);
    }
  }
  for (const row of bought) {
    await addPantryItem({ ingredient: row.ingredient });
  }
  return bought.length;
}

/**
 * Still to pick up — drives the tally on screen. "Already got that"
 * isn't outstanding, so only `needed` counts.
 */
export async function outstandingCount(weekStart: string): Promise<number> {
  const db = await getDb();
  const rows = await db
    .select({ id: shoppingItems.id })
    .from(shoppingItems)
    .where(
      and(
        eq(shoppingItems.weekStart, weekStart),
        eq(shoppingItems.status, "needed"),
      ),
    );
  return rows.length;
}
