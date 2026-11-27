import type { DayActionDraft } from "./compose-day";
import { cookedOnTheDay, prepSession, type PrepMeal } from "./week-prep";

/**
 * Today's food from a week planned day by day (Phase 17): the prep
 * session on prep day, then breakfast, lunch and dinner, each saying
 * whether it's waiting in the fridge or cooked tonight, and any batch to
 * make tonight for later in the week.
 */
export interface PlannedRow {
  mealId: string;
  slot: string;
  makeOn: string | null;
  eatDays: string[] | null;
}

export interface PlannedMeal extends PrepMeal {
  name: string;
}

const weekdayName = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "UTC" }).format(
    new Date(`${iso}T12:00:00Z`),
  );

function span(days: string[]): string {
  const short = (iso: string) => weekdayName(iso).slice(0, 3);
  if (days.length === 0) return "";
  return days.length === 1 ? short(days[0]) : `${short(days[0])}–${short(days[days.length - 1])}`;
}

const SLOT_ORDER = ["breakfast", "lunch", "dinner"];
/** "lunches Thu–Fri", "dinner Wed". */
export const SLOT_PLURAL: Record<string, string> = { breakfast: "breakfasts", lunch: "lunches", dinner: "dinner" };
const SLOT_TITLE: Record<string, string> = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner" };

export function foodActionsFromPlan(input: {
  date: string;
  /** The prep day of the week being prepped today, if any. */
  prepOn: string | null;
  madeToday: PlannedRow[];
  eatenToday: PlannedRow[];
  meals: Map<string, PlannedMeal>;
}): DayActionDraft[] {
  const { date, prepOn, meals } = input;
  const actions: DayActionDraft[] = [];

  // The session leads on prep day: it's the one job that sets up the week.
  const session = prepOn === date ? input.madeToday.filter((row) => !cookedOnTheDay(row)) : [];
  const sessionMeals = [...new Set(session.map((row) => row.mealId))]
    .map((id) => meals.get(id))
    .filter((meal): meal is PlannedMeal => Boolean(meal));
  if (sessionMeals.length > 0) {
    const { order, minutes, slowCookerHours } = prepSession(sessionMeals);
    actions.push({
      domain: "fuel",
      kind: "food",
      title: `Prep session: ${order.length} ${order.length === 1 ? "thing" : "things"}, about ${minutes} min`,
      detail: `${order.map((meal) => meal.name).join(" → ")}${
        slowCookerHours ? ` · then the slow cooker runs about ${slowCookerHours} hours on its own` : ""
      }`,
      rationale: "Longest cooks first, so the oven works while you chop the rest. Portion it up as it cools.",
    });
  }

  for (const row of [...input.eatenToday].sort(
    (a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot),
  )) {
    const meal = meals.get(row.mealId);
    if (!meal) continue;
    const ahead = row.makeOn !== null && row.makeOn !== date;
    const title =
      row.slot === "dinner" && !ahead
        ? `Cook tonight: ${meal.name}`
        : `${SLOT_TITLE[row.slot] ?? "Eat"}: ${meal.name}`;
    const detail = ahead
      ? `Made ${row.makeOn === prepOn ? "in the prep session" : weekdayName(row.makeOn!)}, ${
          row.slot === "dinner" ? "so it just needs warming through" : "so it's in the fridge"
        }`
      : `${meal.activeMinutes} min hands-on${meal.totalMinutes > meal.activeMinutes ? ` · ${meal.totalMinutes} min total` : ""}${
          row.makeOn === date && (row.eatDays?.length ?? 0) > 1 ? " · cook double, it's tomorrow's dinner too" : ""
        }`;
    actions.push({
      domain: "fuel",
      kind: "food",
      title,
      detail,
      rationale: null,
      // Ticking a dinner records it as cooked, as before.
      mealId: row.slot === "dinner" ? meal.id : null,
    });
  }

  // A batch made this evening for later (not the prep session).
  for (const row of input.madeToday) {
    if (row.makeOn === prepOn || cookedOnTheDay(row)) continue;
    const meal = meals.get(row.mealId);
    if (!meal) continue;
    const covers = SLOT_PLURAL[row.slot] ?? row.slot;
    actions.push({
      domain: "fuel",
      kind: "food",
      title: `Tonight, also make ${meal.name.toLowerCase()}`,
      detail: `For ${covers} ${span(row.eatDays ?? [])}`,
      rationale: "Made the evening before, it keeps; made at the prep session, it wouldn't have.",
    });
  }

  return actions;
}
