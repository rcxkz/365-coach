"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { generateWeekPlan } from "@/ai/generate-week-plan";
import {
  addShoppingItem,
  buildShoppingList,
  markWeekChanged,
  removeShoppingItem,
  removeMealFromWeek,
  setShoppingStatus,
  stockPantryFromShopping,
  type ShoppingStatus,
} from "@/data/repos/week-plan";
import { addDaysISO, startOfWeekISO, todayInTimeZone } from "@/domain/dates";
import { requireSession } from "@/lib/require-session";

/** This week's Monday, or next week's when the page is showing next week. */
function weekFor(which: FormDataEntryValue | null | undefined): string {
  const thisWeek = startOfWeekISO(todayInTimeZone());
  return which === "next" ? addDaysISO(thisWeek, 7) : thisWeek;
}

const pageFor = (which: FormDataEntryValue | null | undefined) =>
  which === "next" ? "/fuel/week?week=next" : "/fuel/week";

const withParam = (page: string, param: string) => `${page}${page.includes("?") ? "&" : "?"}${param}`;

function refresh() {
  revalidatePath("/fuel/week");
  revalidatePath("/fuel");
  revalidatePath("/");
}

/** Plans the week: how often each meal is cooked, and the first prep day, from the form. */
export async function planWeek(formData: FormData): Promise<void> {
  await requireSession();
  const which = formData.get("week");
  const prepOn = formData.get("prepOn");
  let mode: string;
  try {
    // normaliseStyle turns anything missing or unknown into the default.
    const result = await generateWeekPlan(weekFor(which), {
      style: {
        breakfast: formData.get("breakfast"),
        lunch: formData.get("lunch"),
        dinner: formData.get("dinner"),
      },
      prepOn: typeof prepOn === "string" && prepOn ? prepOn : undefined,
    });
    mode = result.mode;
  } catch (error) {
    console.error("planWeek failed", error);
    mode = "error";
  }
  refresh();
  redirect(withParam(pageFor(which), `planned=${mode}`));
}

/** "Make my list": the planned meals' shopping, built when asked for. */
export async function makeList(formData: FormData): Promise<void> {
  await requireSession();
  const which = formData.get("week");
  await buildShoppingList(weekFor(which));
  refresh();
  redirect(`${withParam(pageFor(which), "list=made")}#list`);
}

export async function addShoppingLine(formData: FormData): Promise<void> {
  await requireSession();
  const which = formData.get("week");
  const ingredient = String(formData.get("ingredient") ?? "");
  await addShoppingItem(weekFor(which), ingredient);
  refresh();
  redirect(`${pageFor(which)}#list`);
}

/**
 * Dropping a meal changes the plan: a list already made says it's out
 * of date, and rebuilds when asked, rather than changing under you.
 */
export async function dropWeekMeal(mealId: string, which: string | null): Promise<void> {
  await requireSession();
  await removeMealFromWeek(weekFor(which), mealId);
  await markWeekChanged(weekFor(which));
  refresh();
  redirect(pageFor(which));
}

/**
 * The move the whole phase rests on (G6): what you bought becomes what's
 * in the house, so the pantry is never a thing you sit down and maintain.
 */
export async function stockUp(formData: FormData): Promise<void> {
  await requireSession();
  const which = formData.get("week");
  const stocked = await stockPantryFromShopping(weekFor(which));
  refresh();
  redirect(withParam(pageFor(which), `stocked=${stocked}`));
}

/**
 * In-store ticking (Phase 13): called from the client list with an
 * optimistic update, so no page load per tap on a shop's signal.
 */
export async function setShoppingItem(
  id: number,
  status: ShoppingStatus | "remove",
): Promise<void> {
  await requireSession();
  if (status === "remove") await removeShoppingItem(id);
  else await setShoppingStatus(id, status);
  refresh();
}
