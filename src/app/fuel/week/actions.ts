"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { generateWeekPlan } from "@/ai/generate-week-plan";
import {
  addShoppingItem,
  refreshShoppingList,
  removeShoppingItem,
  removeWeekMeal,
  setShoppingStatus,
  stockPantryFromShopping,
  type ShoppingStatus,
} from "@/data/repos/week-plan";
import { startOfWeekISO, todayInTimeZone } from "@/domain/dates";
import { requireSession } from "@/lib/require-session";

function thisWeek(): string {
  return startOfWeekISO(todayInTimeZone());
}

function refresh() {
  revalidatePath("/fuel/week");
  revalidatePath("/fuel");
  revalidatePath("/");
}

/** How many dinners and dedicated lunch preps come from the plan form. */
export async function planWeek(formData: FormData): Promise<void> {
  await requireSession();
  // Absent fields fall back to the defaults rather than reading as 0.
  const count = (name: string) => {
    const value = formData.get(name);
    return value === null || value === "" ? undefined : Number(value);
  };
  let mode: string;
  try {
    const result = await generateWeekPlan(thisWeek(), {
      dinners: count("dinners"),
      lunches: count("lunches"),
    });
    mode = result.mode;
  } catch (error) {
    console.error("planWeek failed", error);
    mode = "error";
  }
  refresh();
  redirect(`/fuel/week?planned=${mode}`);
}

export async function addShoppingLine(formData: FormData): Promise<void> {
  await requireSession();
  const ingredient = String(formData.get("ingredient") ?? "");
  await addShoppingItem(thisWeek(), ingredient);
  refresh();
  redirect("/fuel/week");
}

/** Dropping a meal re-derives the list, so the two can't drift apart. */
export async function dropWeekMeal(id: number): Promise<void> {
  await requireSession();
  await removeWeekMeal(id);
  await refreshShoppingList(thisWeek());
  refresh();
  redirect("/fuel/week");
}

/**
 * The move the whole phase rests on (G6): what you bought becomes what's
 * in the house, so the pantry is never a thing you sit down and maintain.
 */
export async function stockUp(): Promise<void> {
  await requireSession();
  const stocked = await stockPantryFromShopping(thisWeek());
  refresh();
  redirect(`/fuel/week?stocked=${stocked}`);
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
