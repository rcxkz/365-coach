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
import { cookies } from "next/headers";
import { getLockHash, replaceLockHash } from "@/data/repos/lock";
import { SESSION_COOKIE, forgetLockHash, inAppPasscode, lockTokenFor, signingSecret } from "@/lib/auth";
import { hashPasscode, passcodeProblem, verifyPasscode } from "@/lib/passcode";
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

/**
 * Changes a passcode chosen in the app. The cookie is bound to the
 * stored hash, so every other device is signed out; this one gets a new
 * cookie and stays in.
 */
export async function changePasscode(formData: FormData): Promise<void> {
  await requireSession();
  if (!inAppPasscode()) redirect("/settings?passcode=env");
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("passcode") ?? "");
  const hash = await getLockHash();
  if (!hash || !(await verifyPasscode(current, hash))) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    redirect("/settings?passcode=wrong#passcode");
  }
  const problem = passcodeProblem(next, String(formData.get("confirm") ?? ""));
  if (problem) redirect(`/settings?passcode=${encodeURIComponent(problem)}#passcode`);

  const fresh = await hashPasscode(next);
  await replaceLockHash(fresh);
  forgetLockHash();
  (await cookies()).set(SESSION_COOKIE, await lockTokenFor(signingSecret()!, fresh), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });
  redirect("/settings?passcode=changed#passcode");
}
