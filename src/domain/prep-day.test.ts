import { describe, expect, it } from "vitest";
import { foodActionsFromPlan, type PlannedMeal } from "./prep-day";

const meal = (id: string, over: Partial<PlannedMeal> = {}): PlannedMeal => ({
  id,
  name: id.replace(/_/g, " "),
  batchFriendly: true,
  freezerFriendly: false,
  activeMinutes: 10,
  totalMinutes: 40,
  ...over,
});
const meals = new Map(
  [meal("oats", { totalMinutes: 5, activeMinutes: 5 }), meal("chicken_bowls"), meal("tuna_bake"), meal("salad")].map(
    (m) => [m.id, m],
  ),
);
const SUN = "2026-11-29";

describe("foodActionsFromPlan", () => {
  it("leads prep day with the session, longest cook first", () => {
    const actions = foodActionsFromPlan({
      date: SUN,
      prepOn: SUN,
      meals,
      eatenToday: [],
      madeToday: [
        { mealId: "oats", slot: "breakfast", makeOn: SUN, eatDays: ["2026-11-30"] },
        { mealId: "chicken_bowls", slot: "lunch", makeOn: SUN, eatDays: ["2026-11-30"] },
      ],
    });
    expect(actions).toHaveLength(1);
    expect(actions[0].title).toBe("Prep session: 2 things, about 40 min");
    expect(actions[0].detail).toBe("chicken bowls → oats");
  });

  it("says what's waiting in the fridge and what's cooked tonight", () => {
    const actions = foodActionsFromPlan({
      date: "2026-11-30",
      prepOn: null,
      meals,
      madeToday: [],
      eatenToday: [
        { mealId: "tuna_bake", slot: "dinner", makeOn: null, eatDays: ["2026-11-30"] },
        { mealId: "oats", slot: "breakfast", makeOn: SUN, eatDays: ["2026-11-30"] },
        { mealId: "chicken_bowls", slot: "lunch", makeOn: SUN, eatDays: ["2026-11-30"] },
      ],
    });
    expect(actions.map((a) => a.title)).toEqual([
      "Breakfast: oats",
      "Lunch: chicken bowls",
      "Cook tonight: tuna bake",
    ]);
    expect(actions[0].detail).toBe("Made Sunday, so it's in the fridge");
    expect(actions[2].mealId).toBe("tuna_bake");
  });

  it("adds an evening batch for later in the week", () => {
    const [action] = foodActionsFromPlan({
      date: "2026-12-02",
      prepOn: null,
      meals,
      eatenToday: [],
      madeToday: [{ mealId: "salad", slot: "lunch", makeOn: "2026-12-02", eatDays: ["2026-12-03", "2026-12-04"] }],
    });
    expect(action).toMatchObject({ title: "Tonight, also make salad", detail: "For lunches Thu–Fri" });
  });
});
