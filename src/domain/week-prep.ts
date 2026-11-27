import { addDaysISO } from "./dates";

/**
 * Week prep (Phase 17): lay the week's meals across its days, and say
 * when each one is made — in the prep session, the evening before, or
 * on the day. Pure: the planner picks the meals, this decides the when.
 *
 * Food safety sets the shape. Cooked food keeps about three days in the
 * fridge, so a meal made in the prep session covers days up to three
 * after it; a freezer-friendly one can go further (frozen, then moved to
 * the fridge the night before). Anything else is made fresh.
 */
export const FRIDGE_DAYS = 3;

/** Prepped dinners per session: beyond two, a prep day stops being an afternoon. */
export const MAX_PREPPED_DINNERS = 2;

export type PlannedSlot = "breakfast" | "lunch" | "dinner";

export interface PrepMeal {
  id: string;
  name: string;
  batchFriendly: boolean;
  freezerFriendly: boolean;
  activeMinutes: number;
  totalMinutes: number;
  /** A slow cooker runs on its own: its hours aren't the session's. */
  methods?: readonly string[];
}

export interface DayPlanEntry {
  mealId: string;
  slot: PlannedSlot;
  /** The days it's eaten, in order. Empty for a spare dinner. */
  eatDays: string[];
  /** The day it's made; null means "make it on the day you eat it". */
  makeOn: string | null;
}

/** Monday to Sunday of the week. */
export function weekDays(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysISO(weekStart, i));
}


/**
 * Where the prep session can go: the Sunday before the week, or any day
 * of it from today on.
 */
export function prepDayOptions(weekStart: string, today: string): string[] {
  const first = addDaysISO(weekStart, -1);
  return [first, ...weekDays(weekStart)].filter((day) => day >= today);
}

/**
 * The Sunday before, if it's still ahead; otherwise today. A week that's
 * already over (recording one after the fact) keeps the Sunday before.
 */
export function defaultPrepDay(weekStart: string, today: string): string {
  const options = prepDayOptions(weekStart, today);
  return options[0] ?? addDaysISO(weekStart, -1);
}

/** Splits days into `parts` runs, as even as possible, longest first. */
export function splitDays(days: string[], parts: number): string[][] {
  const runs: string[][] = [];
  if (parts <= 0) return runs;
  let start = 0;
  for (let i = 0; i < parts; i++) {
    const size = Math.ceil((days.length - start) / (parts - i));
    runs.push(days.slice(start, start + size));
    start += size;
  }
  return runs.filter((run) => run.length > 0);
}

function chunk(days: string[], size: number): string[][] {
  const pieces: string[][] = [];
  for (let i = 0; i < days.length; i += size) pieces.push(days.slice(i, i + size));
  return pieces.length > 0 ? pieces : [days];
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

/** Whether something made on `makeDay` is still good on every day it's eaten. */
export function keepsUntil(meal: PrepMeal, makeDay: string, eatDays: string[]): boolean {
  if (!meal.batchFriendly || eatDays.length === 0) return false;
  if (meal.freezerFriendly) return true;
  return daysBetween(makeDay, eatDays[eatDays.length - 1]) <= FRIDGE_DAYS;
}

/**
 * When a batch of something gets made: the prep session if it keeps
 * that long, otherwise the evening before its first day (if that's not
 * before the session), otherwise on the day.
 */
function makeDayFor(meal: PrepMeal, eatDays: string[], prepOn: string): string | null {
  if (!meal.batchFriendly || eatDays.length === 0) return null;
  if (eatDays[0] > prepOn && keepsUntil(meal, prepOn, eatDays)) return prepOn;
  const evening = addDaysISO(eatDays[0], -1);
  if (evening >= prepOn && keepsUntil(meal, evening, eatDays)) return evening;
  return null;
}

/**
 * How each meal of the week gets made (Phase 19). The plan always runs
 * seven days; what you choose is how often you cook, not how many kinds.
 */
export const BREAKFAST_MODES = ["quick", "make_ahead", "none"] as const;
export const LUNCH_MODES = ["prep_twice", "every_other_day", "daily", "none"] as const;
export const DINNER_MODES = ["nightly", "every_other_night", "prep_some", "none"] as const;
export type BreakfastMode = (typeof BREAKFAST_MODES)[number];
export type LunchMode = (typeof LUNCH_MODES)[number];
export type DinnerMode = (typeof DINNER_MODES)[number];

export interface WeekStyle {
  breakfast: BreakfastMode;
  lunch: LunchMode;
  dinner: DinnerMode;
}

/** Quick breakfasts, lunch prepped twice, dinner cooked each night. */
export const DEFAULT_STYLE: WeekStyle = { breakfast: "quick", lunch: "prep_twice", dinner: "nightly" };

/** Anything stored or submitted, made into a valid style. */
export function normaliseStyle(input: Partial<Record<keyof WeekStyle, unknown>> | null | undefined): WeekStyle {
  const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
    typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
  return {
    breakfast: pick(input?.breakfast, BREAKFAST_MODES, DEFAULT_STYLE.breakfast),
    lunch: pick(input?.lunch, LUNCH_MODES, DEFAULT_STYLE.lunch),
    dinner: pick(input?.dinner, DINNER_MODES, DEFAULT_STYLE.dinner),
  };
}

/** Quick breakfasts and fresh lunches: hands-on minutes at most. */
export const QUICK_MINUTES = { breakfast: 10, lunch: 15 } as const;

/** Every planned meal: twenty minutes at the stove or less. */
export const MAX_HANDS_ON_MINUTES = 20;

/** The days a plan starting on `prepOn` covers: the week, from the prep day on. */
export function planDays(weekStart: string, prepOn: string): string[] {
  return weekDays(weekStart).filter((day) => day >= prepOn);
}

/**
 * How many different meals each slot needs. Dinners are a different
 * meal each time they're cooked; lunches and breakfasts rotate two or
 * three, because the same lunch twice in a week is a feature.
 */
export function mealsNeeded(style: WeekStyle, dayCount: number): Record<PlannedSlot, number> {
  const n = Math.max(0, dayCount);
  const breakfast = { quick: Math.min(2, n), make_ahead: n > FRIDGE_DAYS ? 2 : Math.min(1, n), none: 0 }[style.breakfast];
  const lunch = {
    prep_twice: Math.min(2, n),
    every_other_day: Math.min(2, Math.ceil(n / 2)),
    daily: Math.min(3, n),
    none: 0,
  }[style.lunch];
  const dinner = { nightly: n, every_other_night: Math.ceil(n / 2), prep_some: n, none: 0 }[style.dinner];
  return { breakfast, lunch, dinner };
}

/** Days shared out one at a time, so two breakfasts alternate. */
function alternate(days: string[], parts: number): string[][] {
  return Array.from({ length: parts }, (_, i) => days.filter((_, index) => index % parts === i)).filter(
    (run) => run.length > 0,
  );
}

export function assignWeek(input: {
  weekStart: string;
  prepOn: string;
  style?: WeekStyle;
  breakfasts: PrepMeal[];
  lunches: PrepMeal[];
  dinners: PrepMeal[];
}): DayPlanEntry[] {
  const { weekStart, prepOn } = input;
  const style = input.style ?? DEFAULT_STYLE;
  // Days already behind the session aren't planned: a mid-week plan
  // starts from the prep day. Every slot covers every day from there.
  const days = planDays(weekStart, prepOn);
  const entries: DayPlanEntry[] = [];

  /** A batch per run, made at the session or the evening before; re-made part-way if it won't keep. */
  const batch = (slot: PlannedSlot, meal: PrepMeal, run: string[]) => {
    const pieces = meal.batchFriendly && !meal.freezerFriendly ? chunk(run, FRIDGE_DAYS) : [run];
    for (const eatDays of pieces) {
      entries.push({ mealId: meal.id, slot, eatDays, makeOn: makeDayFor(meal, eatDays, prepOn) });
    }
  };
  /** Made fresh on each day it's eaten. */
  const fresh = (slot: PlannedSlot, meal: PrepMeal, eatDays: string[]) => {
    if (eatDays.length > 0) entries.push({ mealId: meal.id, slot, eatDays, makeOn: null });
  };
  const cycle = <T,>(list: T[], i: number) => list[i % list.length];

  // Breakfasts.
  const breakfasts = input.breakfasts;
  if (breakfasts.length > 0 && style.breakfast === "quick") {
    alternate(days, breakfasts.length).forEach((run, i) => fresh("breakfast", breakfasts[i], run));
  } else if (breakfasts.length > 0 && style.breakfast === "make_ahead") {
    splitDays(days, breakfasts.length).forEach((run, i) => batch("breakfast", breakfasts[i], run));
  }

  // Lunches: all seven days.
  const lunches = input.lunches;
  if (lunches.length > 0 && style.lunch === "prep_twice") {
    // The longer run goes to a meal that freezes, where there is one,
    // so the second half of it keeps without a third cook.
    const ordered = [...lunches].sort((a, b) => Number(b.freezerFriendly) - Number(a.freezerFriendly));
    splitDays(days, ordered.length).forEach((run, i) => batch("lunch", ordered[i], run));
  } else if (lunches.length > 0 && style.lunch === "every_other_day") {
    // Cooked every other day means just that: the first pair from the
    // prep session, each later pair the evening before, even if it
    // would freeze.
    chunk(days, 2).forEach((run, i) => {
      const evening = addDaysISO(run[0], -1);
      const makeOn = i === 0 && run[0] > prepOn ? prepOn : evening >= prepOn ? evening : null;
      entries.push({ mealId: cycle(lunches, i).id, slot: "lunch", eatDays: run, makeOn });
    });
  } else if (lunches.length > 0 && style.lunch === "daily") {
    alternate(days, lunches.length).forEach((run, i) => fresh("lunch", lunches[i], run));
  }

  // Dinners.
  const dinners = input.dinners;
  if (dinners.length > 0 && style.dinner === "nightly") {
    days.forEach((day, i) => fresh("dinner", cycle(dinners, i), [day]));
  } else if (dinners.length > 0 && style.dinner === "every_other_night") {
    // Cooked on the first night of each pair, warmed up on the second.
    chunk(days, 2).forEach((run, i) =>
      entries.push({ mealId: cycle(dinners, i).id, slot: "dinner", eatDays: run, makeOn: run[0] }),
    );
  } else if (dinners.length > 0 && style.dinner === "prep_some") {
    // The session takes the batch-friendly ones that keep, up to two;
    // the rest are cooked on the night.
    let prepped = 0;
    days.forEach((day, i) => {
      const meal = cycle(dinners, i);
      const ahead = prepped < MAX_PREPPED_DINNERS && day > prepOn && keepsUntil(meal, prepOn, [day]);
      if (ahead) prepped++;
      entries.push({ mealId: meal.id, slot: "dinner", eatDays: [day], makeOn: ahead ? prepOn : null });
    });
  }

  return entries;
}

/** Cooked and eaten the same day (tonight's dinner that's tomorrow's too): not a batch for later. */
export function cookedOnTheDay(row: { makeOn: string | null; eatDays: readonly string[] | null }): boolean {
  return row.makeOn !== null && (row.eatDays ?? []).includes(row.makeOn);
}

/** Minutes per extra dish for switching between them and portioning up. */
const JUGGLE_MINUTES = 5;

/**
 * The prep session: longest cooks first, so the oven and the hob work
 * while you chop the rest. The time is the longer of the slowest cook
 * and all the hands-on minutes (plus a few per extra dish for switching
 * between them and portioning), rounded up to five.
 */
export function prepSession<T extends PrepMeal>(
  meals: T[],
): { order: T[]; minutes: number; slowCookerHours: number | null } {
  const order = [...meals].sort(
    (a, b) => b.totalMinutes - b.activeMinutes - (a.totalMinutes - a.activeMinutes) || b.activeMinutes - a.activeMinutes,
  );
  const handsOn =
    meals.reduce((sum, meal) => sum + meal.activeMinutes, 0) +
    JUGGLE_MINUTES * Math.max(0, meals.length - 1);
  // A slow cooker goes on first and is left: you're not standing there
  // for its five hours, so it doesn't set the session's length.
  const slow = (meal: PrepMeal) => meal.methods?.includes("slow_cooker") ?? false;
  const slowest = meals.filter((meal) => !slow(meal)).reduce((most, meal) => Math.max(most, meal.totalMinutes), 0);
  const slowCooker = meals.filter(slow).reduce((most, meal) => Math.max(most, meal.totalMinutes), 0);
  return {
    order,
    minutes: Math.ceil(Math.max(handsOn, slowest) / 5) * 5,
    slowCookerHours: slowCooker > 0 ? Math.round((slowCooker / 60) * 2) / 2 : null,
  };
}

/** Whether part of a batch made on `makeDay` is eaten past the fridge window. */
export function needsFreezing(makeDay: string, eatDays: string[]): boolean {
  return eatDays.some((day) => daysBetween(makeDay, day) > FRIDGE_DAYS);
}
