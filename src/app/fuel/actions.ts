"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { generateFuelDay } from "@/ai/generate-fuel";
import { recordMealFeedback, setLunchSorted } from "@/data/repos/fuel";
import { markWeekMealCooked } from "@/data/repos/week-plan";
import { startOfWeekISO, todayInTimeZone } from "@/domain/dates";
import { requireSession } from "@/lib/require-session";

function refresh() {
  revalidatePath("/fuel");
  revalidatePath("/fuel/week");
  revalidatePath("/");
}

export async function suggestDinner(): Promise<void> {
  await requireSession();
  await generateFuelDay(todayInTimeZone());
  refresh();
  redirect("/fuel");
}

/**
 * One-tap feedback after cooking (doc 04). Also runs the week's pool
 * down — cooking is the only thing that should shorten the week, and
 * without this the same meal keeps coming back all week (G8).
 */
export async function markCooked(
  mealId: string,
  makeAgain: boolean,
): Promise<void> {
  await requireSession();
  const today = todayInTimeZone();
  await recordMealFeedback({ mealId, cookedOn: today, makeAgain });
  await markWeekMealCooked(startOfWeekISO(today), mealId, today);
  refresh();
  redirect("/fuel?cooked=1");
}

export async function toggleLunchSorted(sorted: boolean): Promise<void> {
  await requireSession();
  await setLunchSorted(todayInTimeZone(), sorted);
  refresh();
  redirect("/fuel");
}
