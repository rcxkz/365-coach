import { describe, expect, it } from "vitest";
import { buildUserMeal, userMealId, type UserMealInput } from "./meals";

const input: UserMealInput = {
  name: "  Sausage & bean one-pot ",
  slots: ["dinner", "lunch"],
  activeMinutes: 12,
  totalMinutes: 40,
  proteinFocus: "pork",
  coreIngredients: ["sausages", "tinned_beans", "sausages", "Not A Key"],
  flexIngredients: ["herbs", "sausages"],
  batchFriendly: true,
  freezerFriendly: true,
  steps: ["Brown the sausages.", "", " Add beans and simmer. "],
};

describe("buildUserMeal", () => {
  it("makes a planner-ready meal from what was entered", () => {
    const result = buildUserMeal(input, "my_test_1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.meal).toMatchObject({
      id: "my_test_1",
      name: "Sausage & bean one-pot",
      attention: "low",
      coreIngredients: ["sausages", "tinned_beans"],
      flexIngredients: ["herbs"],
      steps: ["Brown the sausages.", "Add beans and simmer."],
    });
  });

  it("says what's missing instead of saving a broken meal", () => {
    const result = buildUserMeal({ ...input, name: " ", slots: [], coreIngredients: [] }, "x");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems).toHaveLength(3);
  });

  it("derives effort from hands-on time and never lets total undercut it", () => {
    const result = buildUserMeal({ ...input, activeMinutes: 45, totalMinutes: 10 }, "x");
    expect(result.ok && result.meal.attention).toBe("high");
    expect(result.ok && result.meal.totalMinutes).toBe(45);
  });

  it("names ids readably", () => {
    expect(userMealId("Mum's Chilli", "a1b2")).toBe("my_mums_chilli_a1b2");
  });
});
