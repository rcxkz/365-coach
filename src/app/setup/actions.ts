"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getProfile, saveProfile } from "@/data/repos/profile";
import { requireSession } from "@/lib/require-session";

/** The setup form, as submitted; normaliseProfile does the validating. */
export async function saveSetup(formData: FormData): Promise<void> {
  await requireSession();
  const on = (name: string) => formData.getAll("modules").includes(name);
  // The page won't submit with no part chosen; this covers anything that
  // gets past it, rather than saving an app with nothing switched on.
  if (!on("train") && !on("fuel") && !on("journal")) redirect("/setup?pick=1");
  // Setup doesn't ask about the journal, so what's there stays: custom
  // trackers and hidden questions survive a re-run of setup.
  const { profile: current } = await getProfile();
  await saveProfile({
    journal: current.journal,
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
