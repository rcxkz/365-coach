import { describe, expect, it } from "vitest";
import { archiveUserMeal, listAllMeals, listUserMeals, saveUserMeal } from "./fuel";
import { MEAL_LIBRARY } from "../library/meals";
import { filterMealCandidates } from "../../domain/meal-candidates";
import { buildUserMeal } from "../../domain/meals";

describe("user meals", () => {
  it("join the library for the planners, and leave when removed", async () => {
    const built = buildUserMeal(
      {
        name: "Chorizo rice",
        slots: ["dinner"],
        activeMinutes: 10,
        totalMinutes: 25,
        proteinFocus: "pork",
        coreIngredients: ["chorizo", "rice"],
        batchFriendly: true,
        freezerFriendly: false,
      },
      "my_chorizo_rice_1",
    );
    if (!built.ok) throw new Error("bad fixture");
    await saveUserMeal(built.meal);

    const all = await listAllMeals();
    expect(all).toHaveLength(MEAL_LIBRARY.length + 1);
    const candidates = filterMealCandidates(all, {
      slot: "dinner",
      today: "2026-10-24",
      pantry: [{ ingredient: "chorizo" }, { ingredient: "rice" }],
      userState: [],
    });
    const mine = candidates.find((c) => c.meal.id === "my_chorizo_rice_1");
    expect(mine?.missingIngredients).toEqual([]);

    await archiveUserMeal("my_chorizo_rice_1");
    expect(await listUserMeals()).toEqual([]);
  });

  it("refuses to overwrite a library meal", async () => {
    await expect(saveUserMeal(MEAL_LIBRARY[0])).rejects.toThrow();
  });
});
