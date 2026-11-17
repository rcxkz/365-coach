import { beforeAll, describe, expect, it } from "vitest";
import {
  addCustomIngredient,
  addPantryItem,
  customAisles,
  getFuelDay,
  listMealUserState,
  listPantry,
  pantryForPlanning,
  recordMealFeedback,
  removePantryItem,
  saveFuelDay,
  setLunchSorted,
  setPantry,
  upsertMeals,
} from "./fuel";
import { MEAL_LIBRARY } from "../library/meals";

describe("fuel repo", () => {
  beforeAll(async () => {
    await upsertMeals(MEAL_LIBRARY);
  });

  it("seeds the meal library idempotently", async () => {
    const again = await upsertMeals(MEAL_LIBRARY);
    expect(again).toBe(MEAL_LIBRARY.length);
  });

  it("records pantry items and refreshes rather than duplicating", async () => {
    await addPantryItem({ ingredient: "rice" });
    await addPantryItem({ ingredient: "rice", useByDate: "2026-08-10" });
    const pantry = (await listPantry()).filter(
      (item) => item.ingredient === "rice",
    );
    expect(pantry).toHaveLength(1);
    expect(pantry[0].useByDate).toBe("2026-08-10");
  });

  it("rejects ingredients outside the vocabulary", async () => {
    await expect(
      addPantryItem({ ingredient: "unicorn_steak" }),
    ).rejects.toThrow(/Unknown ingredient/);
  });

  it("soft-removes pantry items", async () => {
    const item = await addPantryItem({ ingredient: "eggs" });
    await removePantryItem(item.id);
    const remaining = (await listPantry()).map((row) => row.ingredient);
    expect(remaining).not.toContain("eggs");
  });

  it("shapes the pantry for planning", async () => {
    const forPlanning = await pantryForPlanning();
    expect(forPlanning.some((item) => item.ingredient === "rice")).toBe(true);
  });

  it("records cooking feedback and counts repeats", async () => {
    await recordMealFeedback({
      mealId: "harissa_chicken_tray",
      cookedOn: "2026-07-28",
      makeAgain: true,
    });
    await recordMealFeedback({
      mealId: "harissa_chicken_tray",
      cookedOn: "2026-08-04",
    });

    const state = await listMealUserState();
    const entry = state.find((row) => row.mealId === "harissa_chicken_tray");
    // A later cook without an opinion must not erase the earlier yes.
    expect(entry?.makeAgain).toBe(true);
    expect(entry?.lastCookedOn).toBe("2026-08-04");
  });

  it("stores the day's food decision and lunch state independently", async () => {
    await saveFuelDay({
      date: "2026-07-28",
      dinnerMealId: "slow_cooker_chilli",
      dinnerReason: "Everything for this is already in.",
      alternativeMealId: "omelette_and_salad",
      alternativeReason: "Eight minutes if the day runs long.",
      mode: "rules",
    });
    await setLunchSorted("2026-07-28", true);

    const day = await getFuelDay("2026-07-28");
    expect(day?.dinnerMealId).toBe("slow_cooker_chilli");
    expect(day?.alternativeMealId).toBe("omelette_and_salad");
    expect(day?.lunchSorted).toBe(true);
  });

  it("can mark lunch sorted on a day with no dinner suggestion yet", async () => {
    await setLunchSorted("2026-08-01", true, "Leftover chilli");
    const day = await getFuelDay("2026-08-01");
    expect(day?.lunchSorted).toBe(true);
    expect(day?.lunchNote).toBe("Leftover chilli");
    expect(day?.dinnerMealId).toBeNull();
  });
});

/**
 * Last in the file on purpose: setPantry is a diff, so these rewrite the
 * whole kitchen and would pull the rug from under the tests above.
 */
describe("setPantry — the kitchen in one pass", () => {
  it("sets the whole kitchen at once", async () => {
    await setPantry(["rice", "eggs", "spinach"]);
    const held = (await listPantry()).map((row) => row.ingredient).sort();
    expect(held).toEqual(["eggs", "rice", "spinach"]);
  });

  it("unticking takes something out of the kitchen", async () => {
    await setPantry(["rice", "eggs", "spinach"]);
    await setPantry(["rice"]);
    expect((await listPantry()).map((row) => row.ingredient)).toEqual(["rice"]);
  });

  it("reports what changed so the screen can say so", async () => {
    await setPantry(["rice"]);
    expect(await setPantry(["rice", "salmon", "broccoli"])).toEqual({
      added: 2,
      removed: 0,
    });
  });

  it("saving the same kitchen twice changes nothing", async () => {
    await setPantry(["rice", "eggs"]);
    expect(await setPantry(["rice", "eggs"])).toEqual({ added: 0, removed: 0 });
    expect(await listPantry()).toHaveLength(2);
  });

  it("quietly drops anything outside the vocabulary", async () => {
    // The form can only submit known ingredients, so a stray value means
    // a stale tab — dropping it beats failing the whole save.
    await setPantry(["rice", "unicorn_steak"]);
    expect((await listPantry()).map((row) => row.ingredient)).toEqual(["rice"]);
  });

  it("empties the kitchen when nothing is ticked", async () => {
    await setPantry(["rice", "eggs"]);
    await setPantry([]);
    expect(await listPantry()).toEqual([]);
  });
});

describe("kitchen — Phase 13", () => {
  it("holds the user's own ingredients and running-low flags", async () => {
    expect(await addCustomIngredient("chorizo", "protein")).toBe(true);
    expect(await addCustomIngredient("salmon", "other")).toBe(false);
    expect((await customAisles()).get("chorizo")).toBe("protein");

    await setPantry([{ ingredient: "chorizo" }, { ingredient: "oat_milk", runningLow: true }, "not_a_thing"]);
    const pantry = await listPantry();
    expect(pantry.map((row) => [row.ingredient, row.runningLow])).toEqual([
      ["chorizo", false],
      ["oat_milk", true],
    ]);

    // Buying it again clears the flag.
    await addPantryItem({ ingredient: "oat_milk" });
    expect((await listPantry()).find((row) => row.ingredient === "oat_milk")?.runningLow).toBe(false);
  });
});
