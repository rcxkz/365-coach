import { beforeAll, describe, expect, it } from "vitest";
import { generateDay } from "./generate-day";
import { generateWeekPlan } from "./generate-week-plan";
import { saveProfile } from "@/data/repos/profile";
import { getDayActions } from "@/data/repos/today";
import { getWeekMeta, listShoppingList, listWeekPlan, buildShoppingList } from "@/data/repos/week-plan";
import { syncLibraries } from "@/data/sync";
import { DEFAULT_PROFILE } from "@/domain/profile";
import { MEAL_LIBRARY } from "@/data/library/meals";

/** A week well ahead, prepped on the Sunday before. */
const WEEK = "2031-06-02";
const SUNDAY = "2031-06-01";
/** Quick breakfasts, lunch prepped twice, a different dinner every night. */
const MY_WEEK = { breakfast: "quick", lunch: "prep_twice", dinner: "nightly" } as const;

describe("a week planned for prepping", () => {
  beforeAll(async () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    await syncLibraries();
    await saveProfile({ ...DEFAULT_PROFILE, modules: { train: false, fuel: true, journal: false } });
    await generateWeekPlan(WEEK, { style: MY_WEEK, prepOn: SUNDAY });
  });

  it("lays out every day, with what's prepped and when", async () => {
    const plan = await listWeekPlan(WEEK);
    const mornings = plan.filter((r) => r.slot === "breakfast").flatMap((r) => r.eatDays ?? []);
    expect(new Set(mornings).size).toBe(7);
    const lunchDays = plan.filter((r) => r.slot === "lunch").flatMap((r) => r.eatDays ?? []);
    expect(new Set(lunchDays).size).toBe(7);
    const dinners = plan.filter((r) => r.slot === "dinner");
    expect(dinners).toHaveLength(7);
    expect(new Set(dinners.map((r) => r.mealId)).size).toBe(7);
    expect(dinners.every((r) => r.makeOn === null)).toBe(true);
    expect(plan.some((r) => r.makeOn === SUNDAY)).toBe(true);
    expect((await getWeekMeta(WEEK))?.prepOn).toBe(SUNDAY);
  });

  it("keeps every meal to twenty minutes hands-on, breakfasts to ten", async () => {
    const plan = await listWeekPlan(WEEK);
    for (const row of plan) {
      const meal = MEAL_LIBRARY.find((m) => m.id === row.mealId)!;
      expect(meal.activeMinutes, meal.name).toBeLessThanOrEqual(row.slot === "breakfast" ? 10 : 20);
    }
  });

  it("waits for 'Make my list' before shopping for the meals", async () => {
    expect(await listShoppingList(WEEK)).toHaveLength(0);
    await buildShoppingList(WEEK);
    expect((await listShoppingList(WEEK)).length).toBeGreaterThan(0);
  });

  it("puts the prep session on Today on prep day, and the meals on the days after", async () => {
    await generateDay(SUNDAY);
    const sunday = await getDayActions(SUNDAY);
    expect(sunday[0].title).toMatch(/^Prep session: /);

    await generateDay(WEEK);
    const monday = (await getDayActions(WEEK)).map((a) => a.title);
    expect(monday.some((t) => t.startsWith("Breakfast: "))).toBe(true);
    expect(monday.some((t) => t.startsWith("Lunch: "))).toBe(true);
    expect(monday.some((t) => /^(Dinner|Cook tonight): /.test(t))).toBe(true);
  });

  it("changes the meals from one week to the next", async () => {
    const next = "2031-06-09";
    await generateWeekPlan(next, { style: MY_WEEK, prepOn: "2031-06-08" });
    const before = new Set((await listWeekPlan(WEEK)).filter((r) => r.slot === "dinner").map((r) => r.mealId));
    const after = (await listWeekPlan(next)).filter((r) => r.slot === "dinner").map((r) => r.mealId);
    expect(after.filter((id) => before.has(id))).toHaveLength(0);
  });
});
