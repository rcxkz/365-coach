"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { draftMealFromText, type MealDraftResult } from "@/ai/draft-meal";
import {
  addCustomIngredient,
  archiveUserMeal,
  isKnownIngredient,
  saveUserMeal,
} from "@/data/repos/fuel";
import {
  buildUserMeal,
  ingredientKey,
  MEAL_SLOTS,
  PROTEIN_FOCUS,
  USER_MEAL_PREFIX,
  userMealId,
  type MealSlot,
  type ProteinFocus,
} from "@/domain/meals";
import { requireSession } from "@/lib/require-session";

function refresh() {
  revalidatePath("/fuel/meals");
  revalidatePath("/fuel");
  revalidatePath("/fuel/week");
}

/** Fills the form from a description or pasted recipe; saves nothing. */
export async function draftMeal(text: string): Promise<MealDraftResult> {
  await requireSession();
  return draftMealFromText(String(text ?? ""));
}

export type SaveMealState = { problems: string[] } | null;

const keysFrom = (values: FormDataEntryValue[]) =>
  values.map((value) => ingredientKey(String(value))).filter((key): key is string => Boolean(key));

export async function saveMeal(
  _previous: SaveMealState,
  formData: FormData,
): Promise<SaveMealState> {
  await requireSession();
  const existingId = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "");
  const id = existingId.startsWith(USER_MEAL_PREFIX)
    ? existingId
    : userMealId(name, randomBytes(3).toString("hex"));

  const core = keysFrom(formData.getAll("core"));
  const flex = keysFrom(formData.getAll("flex"));
  const protein = String(formData.get("proteinFocus") ?? "");

  const result = buildUserMeal(
    {
      name,
      description: String(formData.get("description") ?? ""),
      slots: formData
        .getAll("slots")
        .map(String)
        .filter((slot): slot is MealSlot => (MEAL_SLOTS as readonly string[]).includes(slot)),
      activeMinutes: Number(formData.get("activeMinutes")),
      totalMinutes: Number(formData.get("totalMinutes")),
      proteinFocus: (PROTEIN_FOCUS as readonly string[]).includes(protein)
        ? (protein as ProteinFocus)
        : ("" as ProteinFocus),
      coreIngredients: core,
      flexIngredients: flex,
      batchFriendly: formData.get("batchFriendly") === "on",
      freezerFriendly: formData.get("freezerFriendly") === "on",
      steps: String(formData.get("steps") ?? "").split("\n"),
    },
    id,
  );
  if (!result.ok) return { problems: result.problems };

  // Ingredients typed here that the kitchen doesn't know yet become
  // known, so the kitchen screen can record them and shopping can buy them.
  for (const key of [...result.meal.coreIngredients, ...(result.meal.flexIngredients ?? [])]) {
    if (!(await isKnownIngredient(key))) await addCustomIngredient(key, "other");
  }
  await saveUserMeal(result.meal);
  refresh();
  redirect(`/fuel/meals?saved=${encodeURIComponent(result.meal.name)}`);
}

export async function removeMeal(id: string): Promise<void> {
  await requireSession();
  await archiveUserMeal(id);
  refresh();
  redirect("/fuel/meals?removed=1");
}
