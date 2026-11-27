import { beforeAll, describe, expect, it } from "vitest";
import { generateFuelDay } from "./generate-fuel";
import { generateWeekPlan } from "./generate-week-plan";
import { MEAL_LIBRARY } from "@/data/library/meals";
import { addPantryItem, upsertMeals } from "@/data/repos/fuel";
import {
  buildShoppingList,
  listShoppingList,
  listWeekPlan,
  markWeekMealCooked,
  setShoppingStatus,
  uncookedWeekMeals,
  weekPlanMealDefinitions,
} from "@/data/repos/week-plan";
/** Dinner every other night, nothing else: four dinners for the week. */
const DINNERS_ONLY = { style: { breakfast: "none", lunch: "none", dinner: "every_other_night" } } as const;
const WEEK_DINNERS = 4;

/**
 * With no AI credential, the week must still plan itself and produce a
 * usable shopping list — the same "never a blank screen" guarantee the
 * daily plan makes.
 */
describe("generateWeekPlan without AI", () => {
  beforeAll(async () => {
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    delete process.env.ANTHROPIC_API_KEY;
    await upsertMeals(MEAL_LIBRARY);
  });

  it("plans a full week from the rules and says so", async () => {
    const result = await generateWeekPlan("2026-08-03", DINNERS_ONLY);
    expect(result.mode).toBe("rules");
    expect(result.meals).toHaveLength(WEEK_DINNERS);
    expect(await listWeekPlan("2026-08-03")).toHaveLength(WEEK_DINNERS);
  });

  it("gives every meal in the week a reason", async () => {
    const meals = await listWeekPlan("2026-08-03");
    for (const meal of meals) {
      expect(meal.reason).toBeTruthy();
    }
  });

  it("leaves a shopping list that covers the week", async () => {
    await buildShoppingList("2026-08-03");
    const list = await listShoppingList("2026-08-03");
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((item) => item.status === "needed")).toBe(true);
    expect(list.every((item) => item.source === "derived")).toBe(true);

    // The whole argument for planning a week is that the shop stays
    // small (G3) — five unrelated meals would be twenty-odd items.
    expect(list.length).toBeLessThanOrEqual(16);
  });

  it("does not ask for what's already in the house", async () => {
    await addPantryItem({ ingredient: "rice" });
    await addPantryItem({ ingredient: "eggs" });
    await generateWeekPlan("2026-08-10", DINNERS_ONLY);
    await buildShoppingList("2026-08-10");

    const list = (await listShoppingList("2026-08-10")).map(
      (item) => item.ingredient,
    );
    expect(list.length).toBeGreaterThan(0);
    expect(list).not.toContain("rice");
    expect(list).not.toContain("eggs");
  });

  it("tonight's dinner comes from the week that was shopped for", async () => {
    const week = "2026-08-17";
    await generateWeekPlan(week, DINNERS_ONLY);
    const pool = (await listWeekPlan(week)).map((row) => row.mealId);

    // Everything the week needs is in, so nothing is gated out.
    for (const meal of await weekPlanMealDefinitions(week)) {
      for (const ingredient of meal.coreIngredients) {
        await addPantryItem({ ingredient });
      }
    }

    const day = await generateFuelDay("2026-08-19");
    expect(pool).toContain(day.day.dinnerMealId);
  });

  it("re-planning keeps what has already been cooked", async () => {
    const week = "2026-08-24";
    await generateWeekPlan(week, DINNERS_ONLY);
    const [first] = await listWeekPlan(week);
    await markWeekMealCooked(week, first.mealId, "2026-08-25");

    await generateWeekPlan(week, DINNERS_ONLY);
    const after = await listWeekPlan(week);

    expect(after).toHaveLength(WEEK_DINNERS);
    const kept = after.find((row) => row.mealId === first.mealId);
    expect(kept?.cookedOn).toBe("2026-08-25");
    // Only the uncooked half was replaced, so the week never re-shops
    // for food that's been eaten.
    expect(await uncookedWeekMeals(week)).toHaveLength(WEEK_DINNERS - 1);
  });

  it("keeps cooked meals even when the new shape has no room for them", async () => {
    const week = "2026-08-31";
    await generateWeekPlan(week, { style: { breakfast: "none", lunch: "prep_twice", dinner: "nightly" } });
    const rows = await listWeekPlan(week);
    const dinners = rows.filter((row) => row.slot === "dinner").slice(0, 4);
    const lunch = rows.find((row) => row.slot === "lunch")!;
    for (const row of [...dinners, lunch]) {
      await markWeekMealCooked(week, row.mealId, "2026-09-01");
    }

    // Fewer dinners than already cooked, and no lunch preps at all.
    await generateWeekPlan(week, DINNERS_ONLY);
    const after = await listWeekPlan(week);
    for (const row of [...dinners, lunch]) {
      expect(after.find((kept) => kept.mealId === row.mealId)?.cookedOn).toBe("2026-09-01");
    }
  });

  it("still finds dinner when the week's meals can't be cooked", async () => {
    // A week planned but nothing bought: pool meals fail the pantry gate,
    // so the night has to widen back to the library rather than go blank.
    const day = await generateFuelDay("2026-12-16");
    expect(day.day.dinnerMealId).toBeTruthy();
  });

  it("re-planning a week keeps what the user already sorted", async () => {
    const before = await listShoppingList("2026-08-10");
    const first = before[0];
    await setShoppingStatus(first.id, "bought");

    await generateWeekPlan("2026-08-10", DINNERS_ONLY);
    await buildShoppingList("2026-08-10");
    const after = await listShoppingList("2026-08-10");
    expect(after.find((item) => item.id === first.id)?.status).toBe("bought");
  });
});

describe("generateWeekPlan — dinners and lunch preps (Phase 13)", () => {
  beforeAll(async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await upsertMeals(MEAL_LIBRARY);
  });

  it("plans the asked-for mix, keeps lunch preps out of tonight's pool", async () => {
    const result = await generateWeekPlan("2026-09-07", {
      style: { breakfast: "none", lunch: "prep_twice", dinner: "every_other_night" },
    });
    const dinners = result.meals.filter((row) => row.slot === "dinner");
    const lunches = result.meals.filter((row) => row.slot === "lunch");
    expect(dinners).toHaveLength(4);
    expect(new Set(lunches.map((row) => row.mealId)).size).toBe(2);
    const lunchIds = new Set(lunches.map((row) => row.mealId));
    expect(dinners.some((row) => lunchIds.has(row.mealId))).toBe(false);

    const tonight = await uncookedWeekMeals("2026-09-07", "dinner");
    expect(tonight.every((row) => row.slot === "dinner")).toBe(true);

    // The lunches are shopped for too.
    const pool = await weekPlanMealDefinitions("2026-09-07");
    expect(pool).toHaveLength(6);
  });
});
