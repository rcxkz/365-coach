import { describe, expect, it } from "vitest";
import {
  filterMealCandidates,
  pickFallbackMeals,
  type MealContext,
} from "./meal-candidates";
import type { MealDefinition } from "./meals";

function meal(overrides: Partial<MealDefinition> = {}): MealDefinition {
  return {
    id: "test_meal",
    name: "Test meal",
    description: "A meal.",
    slots: ["dinner"],
    activeMinutes: 10,
    totalMinutes: 30,
    attention: "low",
    methods: ["oven"],
    coreIngredients: ["rice", "chicken_thighs"],
    proteinFocus: "chicken",
    batchFriendly: false,
    freezerFriendly: false,
    steps: ["One.", "Two.", "Three."],
    ...overrides,
  };
}

function context(overrides: Partial<MealContext> = {}): MealContext {
  return {
    slot: "dinner",
    today: "2026-07-28",
    pantry: [{ ingredient: "rice" }, { ingredient: "chicken_thighs" }],
    userState: [],
    ...overrides,
  };
}

describe("filterMealCandidates", () => {
  it("keeps meals whose ingredients are all in the house", () => {
    const [candidate] = filterMealCandidates([meal()], context());
    expect(candidate.missingIngredients).toEqual([]);
    expect(candidate.notes).toContain("Everything for this is already in.");
  });

  it("allows a couple of missing ingredients and names them", () => {
    const [candidate] = filterMealCandidates(
      [meal()],
      context({ pantry: [{ ingredient: "rice" }] }),
    );
    expect(candidate.missingIngredients).toEqual(["chicken_thighs"]);
    expect(candidate.notes[0]).toBe("Needs chicken thighs.");
  });

  it("drops meals needing a whole shop", () => {
    const candidates = filterMealCandidates(
      [meal({ coreIngredients: ["steak", "prawns", "salmon", "tofu"] })],
      context({ pantry: [] }),
    );
    expect(candidates).toEqual([]);
  });

  it("never assumes an empty pantry has anything (F3)", () => {
    const candidates = filterMealCandidates([meal()], context({ pantry: [] }));
    expect(candidates[0]?.missingIngredients).toEqual([
      "rice",
      "chicken_thighs",
    ]);
  });

  it("respects the hands-on time budget, not total time", () => {
    const quick = meal({ id: "quick", activeMinutes: 8, totalMinutes: 90 });
    const fiddly = meal({ id: "fiddly", activeMinutes: 25, totalMinutes: 30 });
    const ids = filterMealCandidates(
      [quick, fiddly],
      context({ maxActiveMinutes: 10 }),
    ).map((candidate) => candidate.meal.id);
    expect(ids).toEqual(["quick"]);
  });

  it("filters by slot", () => {
    const lunchOnly = meal({ id: "lunch_only", slots: ["lunch"] });
    expect(
      filterMealCandidates([lunchOnly], context({ slot: "dinner" })),
    ).toEqual([]);
    expect(
      filterMealCandidates([lunchOnly], context({ slot: "lunch" })),
    ).toHaveLength(1);
  });

  it("rests a meal cooked in the last three days", () => {
    const recent = filterMealCandidates(
      [meal()],
      context({
        userState: [
          { mealId: "test_meal", makeAgain: null, lastCookedOn: "2026-07-27" },
        ],
      }),
    );
    expect(recent).toEqual([]);

    const rested = filterMealCandidates(
      [meal()],
      context({
        userState: [
          { mealId: "test_meal", makeAgain: null, lastCookedOn: "2026-07-20" },
        ],
      }),
    );
    expect(rested).toHaveLength(1);
  });

  it("never suggests something the user said no to again", () => {
    const candidates = filterMealCandidates(
      [meal()],
      context({
        userState: [
          { mealId: "test_meal", makeAgain: false, lastCookedOn: "2026-01-01" },
        ],
      }),
    );
    expect(candidates).toEqual([]);
  });

  it("marks favourites and food that needs using", () => {
    const [candidate] = filterMealCandidates(
      [meal({ flexIngredients: ["spinach"] })],
      context({
        pantry: [
          { ingredient: "rice" },
          { ingredient: "chicken_thighs" },
          { ingredient: "spinach", useByDate: "2026-07-30" },
        ],
        userState: [
          { mealId: "test_meal", makeAgain: true, lastCookedOn: "2026-07-01" },
        ],
      }),
    );
    expect(candidate.favourite).toBe(true);
    expect(candidate.usesUpSoon).toEqual(["spinach"]);
    expect(candidate.notes.join(" ")).toMatch(/before it turns/);
  });

  it("ignores use-by dates already past", () => {
    const [candidate] = filterMealCandidates(
      [meal()],
      context({
        pantry: [
          { ingredient: "rice" },
          { ingredient: "chicken_thighs", useByDate: "2026-07-20" },
        ],
      }),
    );
    expect(candidate.usesUpSoon).toEqual([]);
  });
});

describe("pickFallbackMeals", () => {
  const base = context();

  it("returns null when nothing is cookable", () => {
    expect(pickFallbackMeals([])).toBeNull();
  });

  it("prefers what's already in over what needs buying", () => {
    const candidates = filterMealCandidates(
      [
        meal({ id: "needs_shop", coreIngredients: ["steak"] }),
        meal({ id: "all_in" }),
      ],
      base,
    );
    const picked = pickFallbackMeals(candidates);
    expect(picked?.main.meal.id).toBe("all_in");
  });

  it("offers an alternative that's genuinely easier", () => {
    const candidates = filterMealCandidates(
      [
        meal({ id: "main", activeMinutes: 15 }),
        meal({ id: "easier", activeMinutes: 6 }),
      ],
      base,
    );
    const picked = pickFallbackMeals(candidates);
    expect(picked?.main.meal.id).toBe("easier");
    expect(picked?.alternative?.meal.id).toBe("main");
  });

  it("has no alternative when only one meal is possible", () => {
    const picked = pickFallbackMeals(filterMealCandidates([meal()], base));
    expect(picked?.alternative).toBeNull();
  });
});
