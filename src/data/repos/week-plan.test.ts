import { beforeAll, describe, expect, it } from "vitest";
import { addPantryItem, listPantry, upsertMeals } from "./fuel";
import {
  addShoppingItem,
  listShoppingList,
  listWeekPlan,
  markWeekMealCooked,
  outstandingCount,
  saveWeekPlan,
  setShoppingStatus,
  stockPantryFromShopping,
  syncShoppingList,
  uncookedWeekMeals,
} from "./week-plan";
import { MEAL_LIBRARY } from "../library/meals";

const WEEK = "2026-08-03";

function mealIds(count: number): string[] {
  return MEAL_LIBRARY.slice(0, count).map((meal) => meal.id);
}

describe("week plan repo", () => {
  beforeAll(async () => {
    await upsertMeals(MEAL_LIBRARY);
  });

  it("stores the week's pool", async () => {
    const [a, b] = mealIds(2);
    const saved = await saveWeekPlan(WEEK, [
      { mealId: a, reason: "Uses what's in." },
      { mealId: b },
    ]);
    expect(saved).toHaveLength(2);
    expect((await listWeekPlan(WEEK)).map((row) => row.mealId)).toEqual([a, b]);
  });

  it("runs the pool down as meals get cooked", async () => {
    const [a, b] = mealIds(2);
    await saveWeekPlan(WEEK, [{ mealId: a }, { mealId: b }]);
    await markWeekMealCooked(WEEK, a, "2026-08-04");

    const left = await uncookedWeekMeals(WEEK);
    expect(left.map((row) => row.mealId)).toEqual([b]);
  });

  it("does not resurrect a cooked meal when the week is re-planned", async () => {
    const [a, b, c] = mealIds(3);
    await saveWeekPlan(WEEK, [{ mealId: a }, { mealId: b }]);
    await markWeekMealCooked(WEEK, a, "2026-08-04");

    await saveWeekPlan(WEEK, [{ mealId: a }, { mealId: c }]);
    const left = await uncookedWeekMeals(WEEK);
    expect(left.map((row) => row.mealId)).toEqual([c]);
  });

  it("keeps weeks apart", async () => {
    const [a] = mealIds(1);
    await saveWeekPlan(WEEK, [{ mealId: a }]);
    await saveWeekPlan("2026-08-10", []);
    expect(await listWeekPlan(WEEK)).toHaveLength(1);
    expect(await listWeekPlan("2026-08-10")).toHaveLength(0);
  });
});

describe("shopping list", () => {
  const week = "2026-09-07";

  beforeAll(async () => {
    await upsertMeals(MEAL_LIBRARY);
  });

  it("derives a list and counts what's outstanding", async () => {
    await syncShoppingList(week, ["rice", "chicken_thighs", "peppers"]);
    expect(await listShoppingList(week)).toHaveLength(3);
    expect(await outstandingCount(week)).toBe(3);
  });

  it("re-deriving keeps what the user has already dealt with", async () => {
    const items = await listShoppingList(week);
    const rice = items.find((row) => row.ingredient === "rice")!;
    const peppers = items.find((row) => row.ingredient === "peppers")!;
    await setShoppingStatus(rice.id, "bought");
    await setShoppingStatus(peppers.id, "have");

    // A meal leaves the week, so chicken is no longer needed.
    await syncShoppingList(week, ["rice", "peppers"]);
    const after = await listShoppingList(week);

    expect(after.map((row) => row.ingredient).sort()).toEqual([
      "peppers",
      "rice",
    ]);
    expect(after.find((row) => row.ingredient === "rice")!.status).toBe("bought");
    expect(after.find((row) => row.ingredient === "peppers")!.status).toBe("have");
    expect(await outstandingCount(week)).toBe(0);
  });

  it("never drops something the user added by hand", async () => {
    await addShoppingItem(week, "Kitchen Roll");
    await syncShoppingList(week, ["rice"]);
    const after = await listShoppingList(week);
    expect(after.map((row) => row.ingredient)).toContain("kitchen_roll");
  });

  it("turns what was bought into what's in the house", async () => {
    const fresh = "2026-09-14";
    await syncShoppingList(fresh, ["salmon", "broccoli"]);
    const items = await listShoppingList(fresh);
    for (const item of items) await setShoppingStatus(item.id, "bought");

    const stocked = await stockPantryFromShopping(fresh);
    expect(stocked).toBe(2);

    const pantry = (await listPantry()).map((row) => row.ingredient);
    expect(pantry).toContain("salmon");
    expect(pantry).toContain("broccoli");
  });

  it("leaves non-food off the pantry even when it was bought", async () => {
    const fresh = "2026-09-21";
    await addShoppingItem(fresh, "kitchen roll");
    const [item] = await listShoppingList(fresh);
    await setShoppingStatus(item.id, "bought");

    expect(await stockPantryFromShopping(fresh)).toBe(0);
    const pantry = (await listPantry()).map((row) => row.ingredient);
    expect(pantry).not.toContain("kitchen_roll");
  });

  it("ignores an empty hand-added line", async () => {
    const fresh = "2026-09-28";
    await addShoppingItem(fresh, "   ");
    expect(await listShoppingList(fresh)).toHaveLength(0);
  });

  it("does not duplicate an ingredient already on the list", async () => {
    const fresh = "2026-10-05";
    await syncShoppingList(fresh, ["eggs"]);
    await addShoppingItem(fresh, "eggs");
    expect(await listShoppingList(fresh)).toHaveLength(1);
  });
});

describe("pantry stocking guard", () => {
  it("does nothing for a week with nothing bought", async () => {
    await addPantryItem({ ingredient: "oats" });
    expect(await stockPantryFromShopping("2026-11-02")).toBe(0);
  });
});
