import { describe, expect, it } from "vitest";
import { builtInAisle, ingredientKey, isIngredientKey, shelfOrder } from "./meals";
import { deriveShoppingList } from "./week-plan";

describe("ingredient keys", () => {
  it("slugs what the user types", () => {
    expect(ingredientKey("  Gochujang Paste ")).toBe("gochujang_paste");
    expect(ingredientKey("Crème fraîche-style")).toBe("creme_fraiche_style");
    expect(ingredientKey("!")).toBeNull();
    expect(isIngredientKey("oat_yoghurt")).toBe(true);
    expect(isIngredientKey("Oat Yoghurt")).toBe(false);
  });

  it("puts the user's own at the end of their aisle", () => {
    const aisles = new Map([["chorizo", "protein" as const]]);
    expect(builtInAisle("salmon")).toBe("protein");
    expect(shelfOrder("chorizo", aisles)).toBeGreaterThan(shelfOrder("sausages"));
    expect(shelfOrder("chorizo", aisles)).toBeLessThan(shelfOrder("peppers"));
    expect(shelfOrder("kitchen_roll")).toBeGreaterThan(shelfOrder("herbs"));
  });
});

describe("deriveShoppingList — running low", () => {
  it("adds low items even though they're in", () => {
    const list = deriveShoppingList([], ["oat_milk", "rice"], { runningLow: ["oat_milk"] });
    expect(list.toBuy).toEqual([{ ingredient: "oat_milk", forMeals: ["running low"] }]);
  });
});
