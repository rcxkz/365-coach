import { afterAll, describe, expect, it, vi } from "vitest";
import { buildDemo } from "./demo";
import { listJournalEntries } from "@/data/repos/journal";
import { getProfile } from "@/data/repos/profile";
import { getWeeklyReview } from "@/data/repos/reviews";
import { getWeekMeta, listShoppingList, listWeekPlan } from "@/data/repos/week-plan";
import { listTrainedDates } from "@/data/repos/workouts";
import { getDayActions } from "@/data/repos/today";
import { addDaysISO, startOfWeekISO } from "@/domain/dates";

afterAll(() => vi.unstubAllEnvs());

/** Phase 16: the public demo's person, built end to end without AI. */
describe("buildDemo", () => {
  it("builds two lived-in weeks for Alex", async () => {
    vi.stubEnv("DEMO_MODE", "1");
    vi.stubEnv("APP_PASSCODE", "");
    delete process.env.ANTHROPIC_API_KEY;
    const today = "2026-11-18"; // a Wednesday
    await buildDemo(today);

    const { profile, isSetUp } = await getProfile();
    expect(isSetUp).toBe(true);
    expect(profile.name).toBe("Alex");

    const trained = await listTrainedDates(today);
    expect(trained.length).toBeGreaterThanOrEqual(5);
    // The weekly ceiling holds even in the demo: never more than 4 a week.
    const lastWeek = startOfWeekISO(addDaysISO(today, -7));
    expect(trained.filter((d) => d >= lastWeek && d < startOfWeekISO(today)).length).toBeLessThanOrEqual(4);

    expect((await listJournalEntries(addDaysISO(today, -13), today)).length).toBe(13);
    // This week: prepped on the Sunday before, breakfasts in, list built.
    const week = await listWeekPlan(startOfWeekISO(today));
    expect(week.filter((row) => row.slot === "dinner")).toHaveLength(4);
    expect(week.some((row) => row.slot === "lunch")).toBe(true);
    expect(week.some((row) => row.slot === "breakfast")).toBe(true);
    expect((await getWeekMeta(startOfWeekISO(today)))?.prepOn).toBe(addDaysISO(startOfWeekISO(today), -1));
    expect((await listShoppingList(startOfWeekISO(today))).length).toBeGreaterThan(0);
    expect(await getWeeklyReview(lastWeek)).not.toBeNull();
    expect((await getDayActions(today)).length).toBeGreaterThan(0);
  }, 120_000);
});
