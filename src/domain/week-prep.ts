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

const isWeekday = (weekStart: string, day: string) => {
  const index = weekDays(weekStart).indexOf(day);
  return index >= 0 && index < 5;
};

/**
 * Where the prep session can go: the Sunday before the week, or any day
 * of it from today on.
 */
export function prepDayOptions(weekStart: string, today: string): string[] {
  const first = addDaysISO(weekStart, -1);
  return [first, ...weekDays(weekStart)].filter((day) => day >= today);
}

/** The Sunday before, if it's still ahead; otherwise today. */
export function defaultPrepDay(weekStart: string, today: string): string {
  const options = prepDayOptions(weekStart, today);
  return options[0] ?? today;
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

export function assignWeek(input: {
  weekStart: string;
  prepOn: string;
  breakfasts: PrepMeal[];
  lunches: PrepMeal[];
  dinners: PrepMeal[];
}): DayPlanEntry[] {
  const { weekStart, prepOn } = input;
  // Days already behind the session aren't planned: a mid-week plan
  // starts from the prep day.
  const days = weekDays(weekStart).filter((day) => day >= prepOn);
  const entries: DayPlanEntry[] = [];

  // Breakfasts and lunches: each variety covers a run of days.
  const lunchDays = days.filter((day) => isWeekday(weekStart, day));
  for (const [slot, meals, cover] of [
    ["breakfast", input.breakfasts, days],
    ["lunch", input.lunches, lunchDays.length > 0 ? lunchDays : days],
  ] as const) {
    const runs = splitDays(cover, meals.length);
    meals.forEach((meal, i) => {
      const run = runs[i] ?? [];
      // A batch that won't keep the whole run is made again part-way:
      // oats Monday to Wednesday from the session, Thursday's the
      // evening before.
      const batches =
        meal.batchFriendly && !meal.freezerFriendly ? chunk(run, FRIDGE_DAYS) : [run];
      for (const eatDays of batches) {
        entries.push({ mealId: meal.id, slot, eatDays, makeOn: makeDayFor(meal, eatDays, prepOn) });
      }
    });
  }

  // Dinners: one night each, from the first planned day. The session
  // takes the batch-friendly ones that keep, up to two; the rest are
  // cooked on the night. Dinners beyond the days left stay spare.
  let prepped = 0;
  input.dinners.forEach((meal, i) => {
    const day = days[i];
    if (!day) {
      entries.push({ mealId: meal.id, slot: "dinner", eatDays: [], makeOn: null });
      return;
    }
    const ahead =
      prepped < MAX_PREPPED_DINNERS && day > prepOn && keepsUntil(meal, prepOn, [day]);
    if (ahead) prepped++;
    entries.push({ mealId: meal.id, slot: "dinner", eatDays: [day], makeOn: ahead ? prepOn : null });
  });

  return entries;
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
