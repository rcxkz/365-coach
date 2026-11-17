import { describe, expect, it } from "vitest";
import type { MealCandidate } from "./meal-candidates";
import type { MealDefinition } from "./meals";
import {
  batchDinnersNeeded,
  clampWeekShape,
  deriveShoppingList,
  pantryDepth,
  pickWeekLunches,
  pickWeekPool,
  scorePoolOverlap,
  WEEK_POOL_SIZE,
} from "./week-plan";

function meal(overrides: Partial<MealDefinition> = {}): MealDefinition {
  return {
    id: "meal",
    name: "Meal",
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

function candidate(overrides: Partial<MealCandidate> = {}): MealCandidate {
  return {
    meal: meal(),
    missingIngredients: [],
    usesUpSoon: [],
    favourite: false,
    notes: [],
    ...overrides,
  };
}

describe("pickWeekPool", () => {
  it("returns nothing to plan when there are no candidates", () => {
    expect(pickWeekPool([])).toEqual([]);
  });

  it("fills the pool when the library allows", () => {
    const candidates = Array.from({ length: 12 }, (_, index) =>
      candidate({
        meal: meal({
          id: `meal_${index}`,
          proteinFocus: (["chicken", "fish", "eggs", "tofu", "beef", "pork"] as const)[
            index % 6
          ],
        }),
      }),
    );
    expect(pickWeekPool(candidates)).toHaveLength(WEEK_POOL_SIZE);
  });

  it("anchors the week on a proven meal rather than the smallest one", () => {
    const candidates = [
      candidate({
        meal: meal({ id: "tiny", coreIngredients: ["eggs"], proteinFocus: "eggs" }),
      }),
      candidate({
        favourite: true,
        meal: meal({
          id: "proven",
          coreIngredients: ["rice", "chicken_thighs", "peppers"],
        }),
      }),
    ];
    expect(pickWeekPool(candidates, { size: 2 })[0].meal.id).toBe("proven");
  });

  it("prefers meals that share ingredients with what's already picked", () => {
    const candidates = [
      candidate({
        favourite: true,
        meal: meal({ id: "seed", coreIngredients: ["rice", "chicken_thighs"] }),
      }),
      candidate({
        meal: meal({
          id: "unrelated",
          coreIngredients: ["salmon", "couscous", "lemon"],
          proteinFocus: "fish",
        }),
      }),
      candidate({
        meal: meal({
          id: "overlapping",
          coreIngredients: ["rice", "eggs"],
          proteinFocus: "eggs",
        }),
      }),
    ];
    const pool = pickWeekPool(candidates, { size: 2 });
    expect(pool.map((entry) => entry.meal.id)).toEqual(["seed", "overlapping"]);
  });

  it("never suggests the same meal twice", () => {
    const candidates = Array.from({ length: 6 }, (_, index) =>
      candidate({
        meal: meal({
          id: `meal_${index}`,
          proteinFocus: (["chicken", "fish", "eggs", "tofu", "beef", "pork"] as const)[
            index
          ],
        }),
      }),
    );
    const ids = pickWeekPool(candidates).map((entry) => entry.meal.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("holds the variety gate rather than filling the week with chicken", () => {
    const candidates = Array.from({ length: 8 }, (_, index) =>
      candidate({ meal: meal({ id: `chicken_${index}`, proteinFocus: "chicken" }) }),
    );
    const pool = pickWeekPool(candidates);
    expect(pool).toHaveLength(2);
    expect(pool.every((entry) => entry.meal.proteinFocus === "chicken")).toBe(true);
  });

  it("reserves slots for meals that scale up into lunch", () => {
    // Every small meal overlaps perfectly, so pure overlap-greed would
    // take five of them and leave nothing for lunch.
    const small = Array.from({ length: 8 }, (_, index) =>
      candidate({
        meal: meal({
          id: `small_${index}`,
          coreIngredients: ["eggs"],
          proteinFocus: (["eggs", "fish", "tofu", "legumes"] as const)[index % 4],
          batchFriendly: false,
        }),
      }),
    );
    const batching = candidate({
      meal: meal({
        id: "big_batch",
        coreIngredients: ["rice", "chicken_thighs", "peppers", "onions"],
        proteinFocus: "chicken",
        batchFriendly: true,
      }),
    });

    const pool = pickWeekPool([...small, batching], { minBatchFriendly: 1 });
    expect(pool).toHaveLength(WEEK_POOL_SIZE);
    expect(pool.map((entry) => entry.meal.id)).toContain("big_batch");
  });

  it("plans a full week even when nothing in the library batches", () => {
    const candidates = Array.from({ length: 6 }, (_, index) =>
      candidate({
        meal: meal({
          id: `meal_${index}`,
          batchFriendly: false,
          proteinFocus: (["chicken", "fish", "eggs", "tofu", "beef", "pork"] as const)[
            index
          ],
        }),
      }),
    );
    expect(pickWeekPool(candidates)).toHaveLength(WEEK_POOL_SIZE);
  });

  it("builds the week around meals already chosen", () => {
    const seed = candidate({
      meal: meal({ id: "picked", coreIngredients: ["salmon"], proteinFocus: "fish" }),
    });
    const candidates = Array.from({ length: 6 }, (_, index) =>
      candidate({
        meal: meal({
          id: `meal_${index}`,
          proteinFocus: (["chicken", "eggs", "tofu", "beef", "pork", "legumes"] as const)[
            index
          ],
        }),
      }),
    );
    const pool = pickWeekPool(candidates, { seed: [seed] });
    expect(pool[0].meal.id).toBe("picked");
    expect(pool).toHaveLength(WEEK_POOL_SIZE);
  });

  it("drops a seeded meal that would break the variety gate", () => {
    const chicken = (id: string) =>
      candidate({ meal: meal({ id, proteinFocus: "chicken" }) });
    const others = Array.from({ length: 5 }, (_, index) =>
      candidate({
        meal: meal({
          id: `other_${index}`,
          proteinFocus: (["fish", "eggs", "tofu", "beef", "pork"] as const)[index],
        }),
      }),
    );
    const pool = pickWeekPool(others, {
      seed: [chicken("c1"), chicken("c2"), chicken("c3")],
    });
    const chickens = pool.filter((entry) => entry.meal.proteinFocus === "chicken");
    expect(chickens).toHaveLength(2);
  });

  it("ignores a repeated seed rather than planning it twice", () => {
    const duplicate = candidate({ meal: meal({ id: "same" }) });
    const pool = pickWeekPool([], { seed: [duplicate, duplicate], size: 3 });
    expect(pool.map((entry) => entry.meal.id)).toEqual(["same"]);
  });

  it("is stable — the same candidates always plan the same week", () => {
    const candidates = Array.from({ length: 9 }, (_, index) =>
      candidate({
        meal: meal({
          id: `meal_${index}`,
          proteinFocus: (["chicken", "fish", "eggs"] as const)[index % 3],
        }),
      }),
    );
    const first = pickWeekPool(candidates).map((entry) => entry.meal.id);
    const second = pickWeekPool([...candidates].reverse()).map(
      (entry) => entry.meal.id,
    );
    expect(second).toEqual(first);
  });
});

describe("pantryDepth", () => {
  const ready = (id: string) => candidate({ meal: meal({ id }) });
  const near = (id: string) =>
    candidate({ meal: meal({ id }), missingIngredients: ["rice"] });

  it("calls a kitchen bare when it can barely cook", () => {
    const depth = pantryDepth([ready("a"), ready("b"), near("c")]);
    expect(depth).toEqual({ readyMeals: 2, nearMeals: 1, mode: "bare" });
  });

  it("calls a kitchen stocked once it could cook a few nights", () => {
    const depth = pantryDepth([ready("a"), ready("b"), ready("c")]);
    expect(depth.mode).toBe("stocked");
  });

  it("counts meals, not ingredients — ten condiments is not a kitchen", () => {
    const depth = pantryDepth([
      candidate({
        meal: meal({ id: "a" }),
        missingIngredients: ["rice", "chicken_thighs"],
      }),
    ]);
    expect(depth).toEqual({ readyMeals: 0, nearMeals: 0, mode: "bare" });
  });

  it("reports an empty library without falling over", () => {
    expect(pantryDepth([])).toEqual({
      readyMeals: 0,
      nearMeals: 0,
      mode: "bare",
    });
  });
});

describe("pickWeekPool in use_up mode", () => {
  it("takes what the kitchen can already make over a tighter shop", () => {
    // `tight` shares everything with the anchor but still needs buying;
    // `ready` needs nothing. Overlap mode would take `tight`.
    const anchor = candidate({
      meal: meal({ id: "anchor", coreIngredients: ["rice", "eggs"] }),
      missingIngredients: [],
    });
    const tight = candidate({
      meal: meal({
        id: "tight",
        coreIngredients: ["rice", "eggs"],
        proteinFocus: "tofu",
      }),
      missingIngredients: ["rice", "eggs"],
    });
    const ready = candidate({
      meal: meal({
        id: "ready",
        coreIngredients: ["salmon", "broccoli", "lemon"],
        proteinFocus: "fish",
      }),
      missingIngredients: [],
    });

    const pool = pickWeekPool([anchor, tight, ready], {
      size: 2,
      prefer: "use_up",
      minBatchFriendly: 0,
    });
    expect(pool.map((entry) => entry.meal.id)).toEqual(["anchor", "ready"]);

    const overlapPool = pickWeekPool([anchor, tight, ready], {
      size: 2,
      prefer: "overlap",
      minBatchFriendly: 0,
    });
    expect(overlapPool.map((entry) => entry.meal.id)).toEqual([
      "anchor",
      "tight",
    ]);
  });

  it("anchors on something the kitchen can actually make", () => {
    const favouriteButMissing = candidate({
      favourite: true,
      meal: meal({ id: "wants_a_shop" }),
      missingIngredients: ["steak", "prawns"],
    });
    const inTheHouse = candidate({
      meal: meal({ id: "all_in", proteinFocus: "eggs" }),
      missingIngredients: [],
    });

    const pool = pickWeekPool([favouriteButMissing, inTheHouse], {
      size: 1,
      prefer: "use_up",
      minBatchFriendly: 0,
    });
    expect(pool[0].meal.id).toBe("all_in");
  });
});

describe("deriveShoppingList", () => {
  it("lists what the week needs and skips what's already in", () => {
    const list = deriveShoppingList(
      [meal({ coreIngredients: ["rice", "chicken_thighs"] })],
      ["rice"],
    );
    expect(list.toBuy.map((line) => line.ingredient)).toEqual(["chicken_thighs"]);
  });

  it("names every meal wanting an ingredient, once each", () => {
    const list = deriveShoppingList(
      [
        meal({ id: "a", name: "Fajitas", coreIngredients: ["peppers"] }),
        meal({ id: "b", name: "Shakshuka", coreIngredients: ["peppers"] }),
      ],
      [],
    );
    expect(list.toBuy).toHaveLength(1);
    expect(list.toBuy[0].forMeals).toEqual(["Fajitas", "Shakshuka"]);
  });

  it("keeps nice-to-haves separate so they never block a meal", () => {
    const list = deriveShoppingList(
      [meal({ coreIngredients: ["eggs"], flexIngredients: ["avocado"] })],
      [],
    );
    expect(list.toBuy.map((line) => line.ingredient)).toEqual(["eggs"]);
    expect(list.optional.map((line) => line.ingredient)).toEqual(["avocado"]);
  });

  it("does not call something optional when another meal needs it outright", () => {
    const list = deriveShoppingList(
      [
        meal({ id: "a", coreIngredients: ["eggs"], flexIngredients: ["spinach"] }),
        meal({ id: "b", coreIngredients: ["spinach"], proteinFocus: "legumes" }),
      ],
      [],
    );
    expect(list.toBuy.map((line) => line.ingredient)).toContain("spinach");
    expect(list.optional).toEqual([]);
  });

  it("orders the list cupboard-first, the way the shop is walked", () => {
    const list = deriveShoppingList(
      [meal({ coreIngredients: ["spinach", "chicken_thighs", "rice"] })],
      [],
    );
    expect(list.toBuy.map((line) => line.ingredient)).toEqual([
      "rice",
      "chicken_thighs",
      "spinach",
    ]);
  });

  it("has nothing to buy when the house already has the week in", () => {
    const list = deriveShoppingList([meal()], ["rice", "chicken_thighs"]);
    expect(list.toBuy).toEqual([]);
  });
});

describe("scorePoolOverlap", () => {
  it("counts the distinct shop and how much of it does double duty", () => {
    const overlap = scorePoolOverlap([
      meal({ id: "a", coreIngredients: ["rice", "chicken_thighs"] }),
      meal({ id: "b", coreIngredients: ["rice", "eggs"] }),
    ]);
    expect(overlap).toEqual({
      meals: 2,
      distinctIngredients: 3,
      sharedIngredients: 1,
    });
  });

  it("reports an empty week without dividing by anything", () => {
    expect(scorePoolOverlap([])).toEqual({
      meals: 0,
      distinctIngredients: 0,
      sharedIngredients: 0,
    });
  });
});

describe("week shape — Phase 13", () => {
  it("clamps what the user asks for", () => {
    expect(clampWeekShape(9, -1)).toEqual({ dinners: 7, lunches: 0 });
    expect(clampWeekShape(Number.NaN, 2)).toEqual({ dinners: 5, lunches: 2 });
    expect(batchDinnersNeeded(0)).toBe(2);
    expect(batchDinnersNeeded(3)).toBe(0);
  });

  it("picks lunches that share the dinners' shop and aren't dinners", () => {
    const dinner = candidate({ meal: meal({ id: "d1", coreIngredients: ["rice", "chicken_thighs"] }) });
    const lunches = pickWeekLunches(
      [
        dinner,
        candidate({ meal: meal({ id: "shares", coreIngredients: ["rice", "peppers"], batchFriendly: true }) }),
        candidate({ meal: meal({ id: "new_shop", coreIngredients: ["salmon", "couscous"], batchFriendly: true, proteinFocus: "fish" }) }),
      ],
      [dinner],
      1,
    );
    expect(lunches.map((entry) => entry.meal.id)).toEqual(["shares"]);
  });
});
