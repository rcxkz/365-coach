import { beforeAll, describe, expect, it } from "vitest";
import { upsertMeals } from "./fuel";
import {
  getAction,
  getDayActions,
  replaceDayActions,
  setActionStatus,
} from "./today";
import { MEAL_LIBRARY } from "../library/meals";

const DRAFTS = [
  { domain: "fitness" as const, kind: "workout" as const, title: "Foundation A", rationale: "Momentum beats perfection" },
  { domain: "fuel" as const, kind: "food" as const, title: "Defrost chicken for dinner" },
  { domain: "general" as const, kind: "reminder" as const, title: "Book the physio", detail: "5 minutes" },
];

describe("today repo", () => {
  it("inserts a day's actions in order", async () => {
    const actions = await replaceDayActions("2026-07-20", DRAFTS);
    expect(actions.map((a) => a.position)).toEqual([0, 1, 2]);
    expect(actions.every((a) => a.status === "pending")).toBe(true);
  });

  it("replace is idempotent — old rows removed", async () => {
    await replaceDayActions("2026-07-21", DRAFTS);
    await replaceDayActions("2026-07-21", DRAFTS.slice(0, 2));
    const actions = await getDayActions("2026-07-21");
    expect(actions).toHaveLength(2);
  });

  it("updates action status", async () => {
    const [first] = await replaceDayActions("2026-07-22", DRAFTS);
    await setActionStatus(first.id, "done");
    const actions = await getDayActions("2026-07-22");
    expect(actions.find((a) => a.id === first.id)?.status).toBe("done");
  });
});

/**
 * Ticking a dinner off on Today has to count as cooking it — the tap
 * used to be inert, so the week's pool never ran down and nothing was
 * learned about what actually gets eaten.
 */
describe("food actions carry their meal", () => {
  beforeAll(async () => {
    await upsertMeals(MEAL_LIBRARY);
  });

  it("stores the meal behind a dinner action", async () => {
    const meal = MEAL_LIBRARY[0];
    const [action] = await replaceDayActions("2026-12-01", [
      {
        domain: "fuel",
        kind: "food",
        title: `Dinner: ${meal.name}`,
        mealId: meal.id,
      },
    ]);
    expect(action.mealId).toBe(meal.id);
    expect((await getAction(action.id))?.mealId).toBe(meal.id);
  });

  it("leaves it null for everything that isn't a meal", async () => {
    const [action] = await replaceDayActions("2026-12-02", [
      { domain: "general", kind: "reminder", title: "Book the physio" },
    ]);
    expect(action.mealId).toBeNull();
  });
});
