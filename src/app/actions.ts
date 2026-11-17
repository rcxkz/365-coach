"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adaptTodayPlan } from "@/ai/adapt-day";
import { generateDay } from "@/ai/generate-day";
import { upsertCheckin } from "@/data/repos/checkins";
import {
  recordMealFeedback,
  setMealPreference,
} from "@/data/repos/fuel";
import { upsertOpenPainFlag } from "@/data/repos/pain";
import { endPause, startPause } from "@/data/repos/pauses";
import { getWorkoutByDate, setWorkoutStatus } from "@/data/repos/workouts";
import { PAUSE_REASONS } from "@/domain/comeback";
import { getAction, setActionStatus } from "@/data/repos/today";
import { markWeekMealCooked } from "@/data/repos/week-plan";
import { startOfWeekISO, todayInTimeZone } from "@/domain/dates";
import { BODY_AREAS } from "@/domain/exercises";
import {
  CHECKIN_ENERGY,
  CHECKIN_SLEEP,
  CHECKIN_SORENESS,
  PAIN_SEVERITY_BY_LABEL,
  type PainLabel,
} from "@/domain/readiness";
import { requireSession } from "@/lib/require-session";

/**
 * Ticking a dinner off on Today now records that it was cooked.
 *
 * It used to only flip the action's status, which made the tap inert
 * where it mattered: the week's pool never ran down, and after six days
 * of suggestions the system had learned one thing about one meal.
 * There were two places to say "I cooked it" and the natural one didn't
 * count.
 */
export async function completeAction(id: number): Promise<void> {
  await requireSession();
  const action = await getAction(id);
  await setActionStatus(id, "done");

  // Guarded on the previous status so a double tap doesn't cook it twice.
  if (action && action.status !== "done") {
    const today = todayInTimeZone();

    if (action.mealId) {
      // Cooked, not rated — the thumbs stay a separate, optional tap.
      await recordMealFeedback({ mealId: action.mealId, cookedOn: today });
      await markWeekMealCooked(startOfWeekISO(today), action.mealId, today);
      revalidatePath("/fuel");
      revalidatePath("/fuel/week");
    }
  }

  revalidatePath("/");
}

export async function reopenAction(id: number): Promise<void> {
  await requireSession();
  await setActionStatus(id, "pending");
  revalidatePath("/");
}

/** The thumbs on a cooked dinner — what actually teaches it (doc 04 F6). */
export async function rateMeal(
  mealId: string,
  makeAgain: boolean,
): Promise<void> {
  await requireSession();
  await setMealPreference(mealId, makeAgain);
  revalidatePath("/");
  revalidatePath("/fuel");
}

/** The one-tap fast path: a normal day, recorded (decision D9). */
export async function recordFeelingGood(): Promise<void> {
  await requireSession();
  await upsertCheckin(todayInTimeZone(), {
    energy: "normal",
    sleep: "normal",
    soreness: "none",
  });
  await adaptTodayPlan();
  revalidatePath("/");
  revalidatePath("/workout");
  redirect("/");
}

function pick<T extends string>(
  value: FormDataEntryValue | null,
  allowed: readonly T[],
): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

/** The "something's off" detail form; pain writes to pain_flags (D10). */
export async function recordDetailedCheckin(formData: FormData): Promise<void> {
  await requireSession();
  const sleep = pick(formData.get("sleep"), CHECKIN_SLEEP) ?? "normal";
  const energy = pick(formData.get("energy"), CHECKIN_ENERGY) ?? "normal";
  const soreness = pick(formData.get("soreness"), CHECKIN_SORENESS) ?? "none";

  await upsertCheckin(todayInTimeZone(), { energy, sleep, soreness });

  const painArea = pick(formData.get("painArea"), BODY_AREAS);
  const painLabel = pick(
    formData.get("painSeverity"),
    Object.keys(PAIN_SEVERITY_BY_LABEL) as PainLabel[],
  );
  if (painArea && painLabel) {
    await upsertOpenPainFlag({
      location: painArea,
      severity: PAIN_SEVERITY_BY_LABEL[painLabel],
    });
  }

  // Today's plan follows the readiness the user actually woke up with
  // (Phase 2 design §2) — deterministic, so the tap never waits on AI.
  const result = await adaptTodayPlan();
  revalidatePath("/");
  revalidatePath("/workout");
  redirect(result.adapted ? "/?adapted=1" : "/");
}

export async function planDay(targetDate: string): Promise<void> {
  await requireSession();
  const result = await generateDay(targetDate);
  revalidatePath("/");
  revalidatePath("/workout");
  if (!result.ok) redirect(`/?plan=${result.reason}`);
  const suffix =
    result.mode === "fallback" ? `&why=${result.fallbackReason}` : "";
  redirect(`/?planned=${targetDate}&mode=${result.mode}${suffix}`);
}

/**
 * "I'm unwell" / "taking a break": training stops being planned until
 * they say they're back. Today's session, if untouched, is set aside
 * as skipped — it stays due in the rotation, nothing is lost.
 */
export async function pauseTraining(formData: FormData): Promise<void> {
  await requireSession();
  const reason = pick(formData.get("reason"), PAUSE_REASONS);
  if (!reason) redirect("/");
  const today = todayInTimeZone();
  await startPause(reason, today);
  const workout = await getWorkoutByDate(today);
  const started = workout?.exercises.some((e) => e.sets.length > 0) ?? false;
  if (workout && workout.status === "planned" && !started) {
    await setWorkoutStatus(workout.id, "skipped");
  }
  revalidatePath("/");
  revalidatePath("/workout");
  redirect("/?paused=1");
}

/**
 * Back. Today is re-planned straight away — as an eased-in first
 * session — unless training has already been logged today.
 */
export async function resumeTraining(): Promise<void> {
  await requireSession();
  const today = todayInTimeZone();
  await endPause(today);
  const workout = await getWorkoutByDate(today);
  const started = workout?.exercises.some((e) => e.sets.length > 0) ?? false;
  if (!started) await generateDay(today);
  revalidatePath("/");
  revalidatePath("/workout");
  redirect("/?resumed=1");
}
