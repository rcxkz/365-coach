import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  addPantryItem,
  customAisles,
  isKnownIngredient,
  listAllMeals,
  trimAvoided,
  listPantry,
} from "./fuel";
import { getDb } from "../db";
import { shoppingItems, weekPlanMeals, weekPlans } from "../schema";
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
export type WeekMeta = typeof weekPlans.$inferSelect;
export type PlanSlot = "breakfast" | "lunch" | "dinner";

/** The week's prep day, shape and list state, or null if it was never planned. */
export async function getWeekMeta(weekStart: string): Promise<WeekMeta | null> {
  const db = await getDb();
  const [row] = await db.select().from(weekPlans).where(eq(weekPlans.weekStart, weekStart)).limit(1);
  return row ?? null;
}

/** Records a (re)plan: the shape asked for, and that the plan changed now. */
export async function saveWeekMeta(
  weekStart: string,
  meta: {
    prepOn: string | null;
    breakfasts: number;
    lunches: number;
    dinners: number;
    breakfastMode?: string | null;
    lunchMode?: string | null;
    dinnerMode?: string | null;
  },
): Promise<void> {
  const db = await getDb();
  const changedAt = new Date();
  await db
    .insert(weekPlans)
    .values({ weekStart, ...meta, changedAt })
    .onConflictDoUpdate({ target: weekPlans.weekStart, set: { ...meta, changedAt } });
}

/** The plan changed (a meal dropped): a list built before now is out of date. */
export async function markWeekChanged(weekStart: string): Promise<void> {
  const db = await getDb();
  await db.update(weekPlans).set({ changedAt: new Date() }).where(eq(weekPlans.weekStart, weekStart));
}

/** True once a list has been built and the plan has moved on since. */
export function listIsStale(meta: WeekMeta | null): boolean {
  return Boolean(meta?.listBuiltAt && meta.changedAt > meta.listBuiltAt);
}

/** Planned meals eaten on a day, from whichever week holds them. */
export async function mealsEatenOn(day: string): Promise<WeekPlanMealRow[]> {
  const db = await getDb();
  return db
    .select()
    .from(weekPlanMeals)
    .where(sql`${day} = ANY(${weekPlanMeals.eatDays})`)
    .orderBy(asc(weekPlanMeals.id));
}

/** Planned meals made on a day: the prep session, or an evening make-ahead. */
export async function mealsMadeOn(day: string): Promise<WeekPlanMealRow[]> {
  const db = await getDb();
  return db
    .select()
    .from(weekPlanMeals)
    .where(eq(weekPlanMeals.makeOn, day))
    .orderBy(asc(weekPlanMeals.id));
}

/** The week whose prep session falls on this day, if any. */
export async function weekPreppedOn(day: string): Promise<WeekMeta | null> {
  const db = await getDb();
  const [row] = await db.select().from(weekPlans).where(eq(weekPlans.prepOn, day)).limit(1);
  return row ?? null;
}

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
  entries: {
    mealId: string;
    reason?: string | null;
    slot?: PlanSlot;
    makeOn?: string | null;
    eatDays?: string[] | null;
  }[],
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
        makeOn: entry.makeOn ?? null,
        eatDays: entry.eatDays ?? null,
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

/** Drops a meal from the week, every batch of it. */
export async function removeMealFromWeek(weekStart: string, mealId: string): Promise<void> {
  const db = await getDb();
  await db
    .delete(weekPlanMeals)
    .where(and(eq(weekPlanMeals.weekStart, weekStart), eq(weekPlanMeals.mealId, mealId)));
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
  // A meal made in two batches has two rows; the shop needs it once.
  return trimAvoided(
    [...new Set(rows.map((row) => row.mealId))]
      .map((id) => byId.get(id))
      .filter((meal): meal is MealDefinition => Boolean(meal)),
  );
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
  const [plannedMeals, pantry, aisles, meta] = await Promise.all([
    weekPlanMealDefinitions(weekStart),
    listPantry(),
    customAisles(),
    getWeekMeta(weekStart),
  ]);
  // The planned meals join the list only once it's been asked for
  // ("Make my list"); until then it holds what's running low and
  // anything added by hand.
  const pool = !meta || meta.listBuiltAt ? plannedMeals : [];
  const list = deriveShoppingList(
    pool,
    pantry.map((item) => item.ingredient),
    {
      runningLow: pantry.filter((item) => item.runningLow).map((item) => item.ingredient),
      customAisles: aisles,
    },
  );
  // Out of date (the plan moved on since it was built): leave it as it
  // is until it's rebuilt, rather than quietly swapping items.
  if (listIsStale(meta)) return list;
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

/** "Make my list": the planned meals go on the list, and it's up to date. */
export async function buildShoppingList(weekStart: string): Promise<ShoppingList> {
  const db = await getDb();
  const now = new Date();
  await db
    .insert(weekPlans)
    .values({ weekStart, listBuiltAt: now, changedAt: now })
    .onConflictDoUpdate({ target: weekPlans.weekStart, set: { listBuiltAt: now } });
  return refreshShoppingList(weekStart);
}
