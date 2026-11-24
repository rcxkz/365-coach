import { describe, expect, it } from "vitest";
import {
  assignWeek,
  defaultPrepDay,
  keepsUntil,
  needsFreezing,
  prepDayOptions,
  prepSession,
  splitDays,
  type PrepMeal,
} from "./week-prep";

const WEEK = "2026-11-30"; // a Monday
const SUNDAY_BEFORE = "2026-11-29";

const meal = (id: string, over: Partial<PrepMeal> = {}): PrepMeal => ({
  id,
  name: id,
  batchFriendly: true,
  freezerFriendly: false,
  activeMinutes: 10,
  totalMinutes: 30,
  ...over,
});

describe("prep day", () => {
  it("defaults to the Sunday before, and offers only days still ahead", () => {
    expect(defaultPrepDay(WEEK, "2026-11-27")).toBe(SUNDAY_BEFORE);
    expect(prepDayOptions(WEEK, "2026-12-02")[0]).toBe("2026-12-02");
    expect(defaultPrepDay(WEEK, "2026-12-02")).toBe("2026-12-02");
  });
});

describe("splitDays", () => {
  it("shares days out evenly, longest runs first", () => {
    const days = ["a", "b", "c", "d", "e"];
    expect(splitDays(days, 2)).toEqual([["a", "b", "c"], ["d", "e"]]);
    expect(splitDays(days, 1)).toEqual([days]);
    expect(splitDays(days, 0)).toEqual([]);
  });
});

describe("keepsUntil", () => {
  it("holds cooked food three days in the fridge, longer if it freezes", () => {
    expect(keepsUntil(meal("a"), SUNDAY_BEFORE, ["2026-12-02"])).toBe(true); // Wed: 3 days
    expect(keepsUntil(meal("a"), SUNDAY_BEFORE, ["2026-12-03"])).toBe(false); // Thu: 4 days
    expect(keepsUntil(meal("a", { freezerFriendly: true }), SUNDAY_BEFORE, ["2026-12-05"])).toBe(true);
    expect(keepsUntil(meal("a", { batchFriendly: false }), SUNDAY_BEFORE, ["2026-11-30"])).toBe(false);
  });
});

describe("assignWeek", () => {
  const plan = (over: Partial<Parameters<typeof assignWeek>[0]> = {}) =>
    assignWeek({ weekStart: WEEK, prepOn: SUNDAY_BEFORE, breakfasts: [], lunches: [], dinners: [], ...over });

  it("preps lunches that keep, and makes the late-week run the evening before", () => {
    const entries = plan({ lunches: [meal("bowls"), meal("salad")] });
    expect(entries).toEqual([
      { mealId: "bowls", slot: "lunch", eatDays: ["2026-11-30", "2026-12-01", "2026-12-02"], makeOn: SUNDAY_BEFORE },
      { mealId: "salad", slot: "lunch", eatDays: ["2026-12-03", "2026-12-04"], makeOn: "2026-12-02" },
    ]);
  });

  it("lets a freezer-friendly batch come from the prep session whatever the day", () => {
    const [late] = plan({ lunches: [meal("chilli", { freezerFriendly: true })] }).filter(() => true);
    expect(late.makeOn).toBe(SUNDAY_BEFORE);
    expect(late.eatDays).toHaveLength(5);
  });

  it("covers every breakfast, fresh ones made on the day", () => {
    const entries = plan({ breakfasts: [meal("oats"), meal("eggs", { batchFriendly: false })] });
    expect(entries.flatMap((e) => e.eatDays)).toHaveLength(7);
    // Oats run Mon–Thu: Mon–Wed from the session, Thursday's made Wednesday evening.
    const oats = entries.filter((e) => e.mealId === "oats");
    expect(oats.map((e) => [e.eatDays.length, e.makeOn])).toEqual([
      [3, SUNDAY_BEFORE],
      [1, "2026-12-02"],
    ]);
    expect(entries.find((e) => e.mealId === "eggs")!.makeOn).toBeNull();
  });

  it("preps at most two dinners that keep, and cooks the rest on the night", () => {
    const entries = plan({
      dinners: [meal("d1"), meal("d2"), meal("d3"), meal("d4", { batchFriendly: false }), meal("d5")],
    });
    expect(entries.map((e) => e.eatDays[0])).toEqual([
      "2026-11-30", "2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04",
    ]);
    expect(entries.map((e) => e.makeOn)).toEqual([SUNDAY_BEFORE, SUNDAY_BEFORE, null, null, null]);
  });

  it("starts a mid-week plan from the prep day, cooking that night fresh", () => {
    const entries = plan({ prepOn: "2026-12-02", dinners: [meal("d1"), meal("d2")] });
    expect(entries[0]).toMatchObject({ eatDays: ["2026-12-02"], makeOn: null });
    expect(entries[1]).toMatchObject({ eatDays: ["2026-12-03"], makeOn: "2026-12-02" });
  });

  it("keeps dinners beyond the days left as spares", () => {
    const entries = plan({
      prepOn: "2026-12-05",
      dinners: [meal("d1"), meal("d2"), meal("d3")],
    });
    expect(entries.map((e) => e.eatDays.length)).toEqual([1, 1, 0]);
  });
});

describe("prepSession", () => {
  it("starts the long, hands-off cooks first and times the session honestly", () => {
    const { order, minutes } = prepSession([
      meal("salad", { activeMinutes: 15, totalMinutes: 15 }),
      meal("tray", { activeMinutes: 10, totalMinutes: 50 }),
      meal("oats", { activeMinutes: 5, totalMinutes: 5 }),
    ]);
    expect(order.map((m) => m.id)).toEqual(["tray", "salad", "oats"]);
    expect(minutes).toBe(50);
  });
});

describe("needsFreezing", () => {
  it("only when part of the batch is eaten past three days", () => {
    expect(needsFreezing(SUNDAY_BEFORE, ["2026-12-01"])).toBe(false);
    expect(needsFreezing(SUNDAY_BEFORE, ["2026-12-01", "2026-12-04"])).toBe(true);
  });
});
