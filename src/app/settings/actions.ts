"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { upsertExerciseUserState } from "@/data/repos/exercises";
import { clearMealPreference } from "@/data/repos/fuel";
import {
  addMemory,
  archiveMemory,
  updateMemoryContent,
} from "@/data/repos/memories";
import { deletePushSubscription, savePushSubscription } from "@/data/repos/push";
import { requireSession } from "@/lib/require-session";
import { sendPush } from "@/services/push";

type SubscriptionJson = {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
};

function parse(json: SubscriptionJson) {
  const { endpoint, keys } = json;
  if (
    typeof endpoint !== "string" ||
    !endpoint.startsWith("https://") ||
    typeof keys?.p256dh !== "string" ||
    typeof keys?.auth !== "string"
  ) {
    throw new Error("Not a push subscription");
  }
  return { endpoint, p256dh: keys.p256dh, auth: keys.auth };
}

export async function subscribeToReminders(json: SubscriptionJson): Promise<void> {
  await requireSession();
  const subscription = parse(json);
  await savePushSubscription(subscription);
  // Proves the whole path works, now, instead of tomorrow at 7.
  await sendPush(subscription, {
    title: "Morning reminders are on",
    body: "One nudge around 7am with today's session. Nothing on rest or unwell days.",
  });
  revalidatePath("/settings");
}

export async function unsubscribeFromReminders(endpoint: string): Promise<void> {
  await requireSession();
  if (typeof endpoint !== "string") return;
  await deletePushSubscription(endpoint);
  revalidatePath("/settings");
}

/** Long enough for a real note, short enough to stay a note. */
const MAX_MEMORY_LENGTH = 600;

function memoryText(formData: FormData): string | null {
  const text = String(formData.get("content") ?? "").trim();
  return text.length > 0 && text.length <= MAX_MEMORY_LENGTH ? text : null;
}

export async function addCoachNote(formData: FormData): Promise<void> {
  await requireSession();
  const content = memoryText(formData);
  if (content) await addMemory({ tier: "long_term", domain: "fitness", content });
  revalidatePath("/settings");
  redirect("/settings?saved=coach");
}

export async function saveCoachNote(id: number, formData: FormData): Promise<void> {
  await requireSession();
  const content = memoryText(formData);
  if (content) await updateMemoryContent(id, content);
  revalidatePath("/settings");
  redirect("/settings?saved=coach");
}

export async function forgetCoachNote(id: number): Promise<void> {
  await requireSession();
  await archiveMemory(id);
  revalidatePath("/settings");
  redirect("/settings?saved=forgot");
}

export async function bringBackExercise(exerciseId: string): Promise<void> {
  await requireSession();
  // Neutral, not liked: undoing "not for me" isn't a vote for it.
  await upsertExerciseUserState({ exerciseId, preference: 0 });
  revalidatePath("/settings");
  redirect("/settings?saved=back");
}

export async function bringBackMeal(mealId: string): Promise<void> {
  await requireSession();
  await clearMealPreference(mealId);
  revalidatePath("/settings");
  revalidatePath("/fuel");
  redirect("/settings?saved=back");
}
