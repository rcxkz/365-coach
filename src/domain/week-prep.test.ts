import { describe, expect, it } from "vitest";
import {
  assignWeek,
  cookedOnTheDay,
  DEFAULT_STYLE,
  mealsNeeded,
  normaliseStyle,
  type WeekStyle,
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
  const MON = "2026-11-30", TUE = "2026-12-01", WED = "2026-12-02", THU = "2026-12-03",
    FRI = "2026-12-04", SAT = "2026-12-05", SUN = "2026-12-06";
  const ALL = [MON, TUE, WED, THU, FRI, SAT, SUN];
  const plan = (style: Partial<WeekStyle>, over: Partial<Parameters<typeof assignWeek>[0]> = {}) =>
    assignWeek({
      weekStart: WEEK,
      prepOn: SUNDAY_BEFORE,
      style: { breakfast: "none", lunch: "none", dinner: "none", ...style },
      breakfasts: [],
      lunches: [],
      dinners: [],
      ...over,
    });

  it("cooks a different dinner every night, fresh", () => {
    const dinners = ALL.map((_, i) => meal(`d${i}`));
    const entries = plan({ dinner: "nightly" }, { dinners });
    expect(entries.map((e) => e.eatDays)).toEqual(ALL.map((day) => [day]));
    expect(entries.every((e) => e.makeOn === null)).toBe(true);
    expect(new Set(entries.map((e) => e.mealId)).size).toBe(7);
  });

  it("cooks every other night and warms it up the next", () => {
    const entries = plan({ dinner: "every_other_night" }, { dinners: [meal("a"), meal("b"), meal("c"), meal("d")] });
    expect(entries.map((e) => [e.eatDays, e.makeOn])).toEqual([
      [[MON, TUE], MON],
      [[WED, THU], WED],
      [[FRI, SAT], FRI],
      [[SUN], SUN],
    ]);
  });

  it("preps lunch twice across all seven days, the long run on a meal that freezes", () => {
    const entries = plan(
      { lunch: "prep_twice" },
      { lunches: [meal("salad"), meal("chilli", { freezerFriendly: true })] },
    );
    expect(entries).toEqual([
      { mealId: "chilli", slot: "lunch", eatDays: [MON, TUE, WED, THU], makeOn: SUNDAY_BEFORE },
      { mealId: "salad", slot: "lunch", eatDays: [FRI, SAT, SUN], makeOn: THU },
    ]);
  });

  it("makes a third batch rather than break the fridge rule when nothing freezes", () => {
    const entries = plan({ lunch: "prep_twice" }, { lunches: [meal("bowls"), meal("salad")] });
    expect(entries.flatMap((e) => e.eatDays)).toEqual(ALL);
    expect(entries.map((e) => e.makeOn)).toEqual([SUNDAY_BEFORE, WED, THU]);
  });

  it("cooks lunch every other day, the evening before, two lunches taking turns", () => {
    const entries = plan(
      { lunch: "every_other_day" },
      { lunches: [meal("a", { freezerFriendly: true }), meal("b")] },
    );
    expect(entries.map((e) => [e.mealId, e.eatDays, e.makeOn])).toEqual([
      ["a", [MON, TUE], SUNDAY_BEFORE],
      ["b", [WED, THU], TUE],
      ["a", [FRI, SAT], THU],
      ["b", [SUN], SAT],
    ]);
  });

  it("alternates quick breakfasts, made on the morning", () => {
    const entries = plan({ breakfast: "quick" }, { breakfasts: [meal("eggs"), meal("toast")] });
    expect(entries).toEqual([
      { mealId: "eggs", slot: "breakfast", eatDays: [MON, WED, FRI, SUN], makeOn: null },
      { mealId: "toast", slot: "breakfast", eatDays: [TUE, THU, SAT], makeOn: null },
    ]);
  });

  it("makes breakfasts ahead in batches that keep", () => {
    const entries = plan({ breakfast: "make_ahead" }, { breakfasts: [meal("oats"), meal("muffins")] });
    expect(entries.flatMap((e) => e.eatDays)).toEqual(ALL);
    expect(entries[0]).toMatchObject({ mealId: "oats", eatDays: [MON, TUE, WED], makeOn: SUNDAY_BEFORE });
  });

  it("preps two dinners ahead and cooks the rest", () => {
    const dinners = ALL.map((_, i) => meal(`d${i}`));
    const entries = plan({ dinner: "prep_some" }, { dinners });
    expect(entries.map((e) => e.makeOn)).toEqual([SUNDAY_BEFORE, SUNDAY_BEFORE, null, null, null, null, null]);
  });

  it("starts a mid-week plan from the prep day", () => {
    const entries = plan({ dinner: "nightly" }, { prepOn: FRI, dinners: [meal("a"), meal("b"), meal("c")] });
    expect(entries.map((e) => e.eatDays[0])).toEqual([FRI, SAT, SUN]);
  });
});

describe("mealsNeeded", () => {
  it("matches how often each meal is cooked over the days planned", () => {
    expect(mealsNeeded({ breakfast: "quick", lunch: "prep_twice", dinner: "nightly" }, 7)).toEqual({
      breakfast: 2,
      lunch: 2,
      dinner: 7,
    });
    expect(mealsNeeded({ breakfast: "none", lunch: "every_other_day", dinner: "every_other_night" }, 7)).toEqual({
      breakfast: 0,
      lunch: 2,
      dinner: 4,
    });
    expect(mealsNeeded(DEFAULT_STYLE, 2).dinner).toBe(2);
  });

  it("reads a stored style safely", () => {
    expect(normaliseStyle({ breakfast: "make_ahead", lunch: "nonsense" })).toEqual({
      ...DEFAULT_STYLE,
      breakfast: "make_ahead",
    });
    expect(normaliseStyle(null)).toEqual(DEFAULT_STYLE);
  });
});

describe("cookedOnTheDay", () => {
  it("spots tonight's dinner that's also tomorrow's", () => {
    expect(cookedOnTheDay({ makeOn: "2026-12-01", eatDays: ["2026-12-01", "2026-12-02"] })).toBe(true);
    expect(cookedOnTheDay({ makeOn: SUNDAY_BEFORE, eatDays: ["2026-11-30"] })).toBe(false);
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

describe("prepSession with a slow cooker", () => {
  it("doesn't count the slow cooker's hours as your time", () => {
    const { minutes, slowCookerHours } = prepSession([
      meal("chilli", { activeMinutes: 10, totalMinutes: 300, methods: ["slow_cooker"] }),
      meal("tray", { activeMinutes: 10, totalMinutes: 40, methods: ["oven"] }),
    ]);
    expect(minutes).toBe(40);
    expect(slowCookerHours).toBe(5);
  });
});
