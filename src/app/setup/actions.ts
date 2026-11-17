"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { saveProfile } from "@/data/repos/profile";
import { requireSession } from "@/lib/require-session";

/** The setup form, as submitted; normaliseProfile does the validating. */
export async function saveSetup(formData: FormData): Promise<void> {
  await requireSession();
  const on = (name: string) => formData.getAll("modules").includes(name);
  await saveProfile({
    name: formData.get("name"),
    modules: { train: on("train"), fuel: on("fuel"), journal: on("journal") },
    training: {
      plan: formData.get("plan"),
      experience: formData.get("experience"),
      returning: formData.get("returning") === "yes",
      daysPerWeek: formData.get("daysPerWeek"),
      sessionMinutes: formData.get("sessionMinutes"),
      equipment: formData.get("equipment"),
    },
    protect: formData.getAll("protect"),
    food: {
      diet: formData.getAll("diet"),
      householdSize: formData.get("householdSize"),
      habit: formData.get("habit"),
    },
  });
  revalidatePath("/", "layout");
  redirect("/?setup=done");
}
