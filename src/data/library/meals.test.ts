import { describe, expect, it } from "vitest";
import { MEAL_LIBRARY } from "./meals";
import { filterMealCandidates } from "../../domain/meal-candidates";
import { INGREDIENTS, isIngredient, MEAL_SLOTS } from "../../domain/meals";
import {
  pickWeekPool,
  scorePoolOverlap,
  WEEK_POOL_SIZE,
} from "../../domain/week-plan";

/**
 * Integrity of the curated meal library — the same guarantee the
 * exercise library carries, so selection logic can trust the data.
 */
describe("meal library", () => {
  it("has unique ids and a workable size", () => {
    const ids = new Set(MEAL_LIBRARY.map((meal) => meal.id));
    expect(ids.size).toBe(MEAL_LIBRARY.length);
    expect(MEAL_LIBRARY.length).toBeGreaterThanOrEqual(25);
  });

  it("uses only known ingredients", () => {
    const unknown: string[] = [];
    for (const meal of MEAL_LIBRARY) {
      for (const ingredient of [
        ...meal.coreIngredients,
        ...(meal.flexIngredients ?? []),
      ]) {
        if (!isIngredient(ingredient)) unknown.push(`${meal.id}: ${ingredient}`);
      }
    }
    expect(unknown).toEqual([]);
  });

  it("keeps active time at or below total time", () => {
    for (const meal of MEAL_LIBRARY) {
      expect(meal.activeMinutes, meal.id).toBeGreaterThan(0);
      expect(meal.activeMinutes, meal.id).toBeLessThanOrEqual(meal.totalMinutes);
    }
  });

  it("is weighted towards low active effort (doc 04's real constraint)", () => {
    const lowEffort = MEAL_LIBRARY.filter((meal) => meal.activeMinutes <= 12);
    expect(lowEffort.length).toBeGreaterThan(MEAL_LIBRARY.length / 2);
  });

  it("gives every meal cookable steps and a slot", () => {
    for (const meal of MEAL_LIBRARY) {
      expect(meal.steps.length, meal.id).toBeGreaterThanOrEqual(3);
      expect(meal.slots.length, meal.id).toBeGreaterThan(0);
      for (const slot of meal.slots) {
        expect(MEAL_SLOTS).toContain(slot);
      }
      expect(meal.coreIngredients.length, meal.id).toBeGreaterThan(0);
      expect(meal.description.length, meal.id).toBeGreaterThan(0);
    }
  });

  it("offers enough batch-friendly lunches to beat a takeaway-lunch habit", () => {
    const lunchReady = MEAL_LIBRARY.filter(
      (meal) => meal.batchFriendly && meal.slots.includes("lunch"),
    );
    expect(lunchReady.length).toBeGreaterThanOrEqual(8);
  });

  it("always has an emergency option needing under 10 active minutes", () => {
    const emergency = MEAL_LIBRARY.filter((meal) => meal.activeMinutes <= 10);
    expect(emergency.length).toBeGreaterThanOrEqual(8);
  });

  it("never lists dairy in its ingredients", () => {
    // The vocabulary itself excludes milk and cheese; this guards the list.
    const dairy = ["milk", "cheese", "butter", "cream", "yoghurt"];
    for (const ingredient of INGREDIENTS) {
      expect(dairy).not.toContain(ingredient);
    }
  });

  it("can plan a full week from an empty house without repeating a protein", () => {
    // The variety gate (G4) only helps if the library is broad enough to
    // satisfy it — otherwise a planned week quietly comes back short.
    const candidates = filterMealCandidates(MEAL_LIBRARY, {
      slot: "dinner",
      today: "2026-08-03",
      pantry: [],
      userState: [],
      maxMissingIngredients: Number.MAX_SAFE_INTEGER,
    });
    const pool = pickWeekPool(candidates);
    expect(pool).toHaveLength(WEEK_POOL_SIZE);

    const proteins = pool.map((entry) => entry.meal.proteinFocus);
    for (const protein of new Set(proteins)) {
      expect(proteins.filter((entry) => entry === protein).length).toBeLessThanOrEqual(2);
    }
  });

  it("keeps a planned week's shop small enough to be worth planning", () => {
    const candidates = filterMealCandidates(MEAL_LIBRARY, {
      slot: "dinner",
      today: "2026-08-03",
      pantry: [],
      userState: [],
      maxMissingIngredients: Number.MAX_SAFE_INTEGER,
    });
    const pool = pickWeekPool(candidates).map((entry) => entry.meal);
    const overlap = scorePoolOverlap(pool);

    // Five unrelated meals would be ~20 distinct items. Overlap is the
    // whole argument for planning a week (G3), so hold it to a number.
    expect(overlap.distinctIngredients).toBeLessThanOrEqual(16);
    expect(overlap.sharedIngredients).toBeGreaterThanOrEqual(2);
  });

  it("plans a week that actually leaves lunches", () => {
    // Doc 04's headline behaviour is impulse takeaway lunches. A week of
    // single-portion meals cooks fine and defends nothing (G11).
    const candidates = filterMealCandidates(MEAL_LIBRARY, {
      slot: "dinner",
      today: "2026-08-03",
      pantry: [],
      userState: [],
      maxMissingIngredients: Number.MAX_SAFE_INTEGER,
    });
    const batching = pickWeekPool(candidates).filter(
      (entry) => entry.meal.batchFriendly,
    );
    expect(batching.length).toBeGreaterThanOrEqual(2);
  });
});
