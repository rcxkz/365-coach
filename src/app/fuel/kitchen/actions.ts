"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { addCustomIngredient, setPantry } from "@/data/repos/fuel";
import { refreshShoppingList } from "@/data/repos/week-plan";
import { startOfWeekISO, todayInTimeZone } from "@/domain/dates";
import { AISLES, ingredientKey, type Aisle } from "@/domain/meals";
import { requireSession } from "@/lib/require-session";

/**
 * One save for the whole kitchen (K1). Each `ingredient` is `key` or
 * `key:low`; each `custom` is a newly added `key|aisle`, registered
 * before the pantry is set so it counts as known.
 */
export async function saveKitchen(formData: FormData): Promise<void> {
  await requireSession();

  for (const value of formData.getAll("custom").map(String)) {
    const [label, aisle] = value.split("|");
    const key = ingredientKey(label ?? "");
    if (key) {
      await addCustomIngredient(
        key,
        (AISLES as readonly string[]).includes(aisle) ? (aisle as Aisle) : "other",
      );
    }
  }

  const items = formData.getAll("ingredient").map((value) => {
    const [ingredient, flag] = String(value).split(":");
    return { ingredient, runningLow: flag === "low" };
  });
  const { added, removed } = await setPantry(items);
  // Running-low items belong on this week's list straight away.
  await refreshShoppingList(startOfWeekISO(todayInTimeZone()));

  revalidatePath("/fuel/kitchen");
  revalidatePath("/fuel");
  revalidatePath("/fuel/week");
  redirect(`/fuel/kitchen?added=${added}&removed=${removed}`);
}
