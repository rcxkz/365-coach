import { describe, expect, it } from "vitest";
import { avoidedIngredients, mealAvoids, normaliseAvoid, withoutAvoided } from "./avoid";
import { INGREDIENTS } from "./meals";
import { MEAL_LIBRARY } from "@/data/library/meals";
import { normaliseProfile } from "./profile";

const keys: string[] = [...INGREDIENTS];
const avoid = (note: string) => avoidedIngredients(note, keys);

describe("avoidedIngredients", () => {
  it("reads the box the way it's written", () => {
    expect(avoid("I can't have oats")).toEqual(["oats", "oat_milk"]);
    expect(avoid("no tomatoes please")).toEqual(["tinned_tomatoes", "tomatoes"]);
    expect(avoid("No tomato")).toEqual(["tinned_tomatoes", "tomatoes"]);
    expect(avoid("mushrooms, coconut")).toEqual(["coconut_milk", "mushrooms", "coconut_yoghurt"]);
  });

  it("doesn't let a general word rule out more than it says", () => {
    expect(avoid("no butter")).toEqual(["butter"].filter((k) => keys.includes(k)));
    expect(avoid("no milk")).not.toContain("oat_milk");
    expect(avoid("sweet potatoes")).toEqual(["sweet_potatoes"]);
    expect(avoid("peanut butter")).toEqual(["peanut_butter"]);
  });

  it("understands a few everyday words for groups", () => {
    expect(avoid("no pork")).toEqual(expect.arrayContaining(["pork", "bacon", "sausages"]));
    expect(avoid("nut allergy")).toContain("peanut_butter");
    expect(avoid("no seafood")).toEqual(expect.arrayContaining(["prawns", "salmon"]));
  });

  it("matches the user's own ingredients too", () => {
    expect(avoidedIngredients("no gochujang", [...keys, "gochujang_paste"])).toEqual(["gochujang_paste"]);
  });

  it("finds nothing in a note with no ingredient in it", () => {
    expect(avoid("nothing too heavy")).toEqual([]);
    expect(avoid("")).toEqual([]);
  });
});

describe("leaving things out of meals", () => {
  it("takes oat meals off the menu and keeps the rest", () => {
    const out = avoid("oats");
    const left = MEAL_LIBRARY.filter((meal) => mealAvoids(meal, out));
    expect(left.length).toBeLessThan(MEAL_LIBRARY.length);
    expect(left.some((meal) => meal.coreIngredients.includes("oats"))).toBe(false);
    expect(left.some((meal) => meal.slots.includes("breakfast"))).toBe(true);
  });

  it("drops a ruled-out nice-to-have without losing the meal", () => {
    const meal = { ...MEAL_LIBRARY[0], flexIngredients: ["tomatoes", "herbs"] };
    expect(withoutAvoided(meal, ["tomatoes"]).flexIngredients).toEqual(["herbs"]);
  });
});

describe("normaliseAvoid", () => {
  it("is tidy, short and optional", () => {
    expect(normaliseAvoid("  no   oats ")).toBe("no oats");
    expect(normaliseAvoid(42)).toBe("");
    expect(normaliseAvoid("x".repeat(500))).toHaveLength(200);
    expect(normaliseProfile({ food: { avoid: "no oats" } }).food.avoid).toBe("no oats");
  });
});
