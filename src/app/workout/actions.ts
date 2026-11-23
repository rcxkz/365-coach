"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { generateDay } from "@/ai/generate-day";
import {
  RULED_OUT_PREFERENCE,
  upsertExerciseUserState,
} from "@/data/repos/exercises";
import { addPainFlag, resolvePainFlag } from "@/data/repos/pain";
import { getDayActions, setActionStatus } from "@/data/repos/today";
import {
  deleteSetLog,
  deleteUnloggedWorkoutExercise,
  getWorkoutByDate,
  includeAllExercises,
  logSet,
  setIncludedExercises,
  setWorkoutStatus,
  workoutExerciseExists,
} from "@/data/repos/workouts";
import { shortenWorkout } from "@/domain/shorten";
import { todayInTimeZone } from "@/domain/dates";
import { GONE } from "@/lib/offline-queue";
import { requireSession } from "@/lib/require-session";

function refresh() {
  revalidatePath("/workout");
  revalidatePath("/workout/past");
  revalidatePath("/");
}

/**
 * Every session action takes the date it applies to. Today is the
 * common case, but the same buttons drive a backdated session on
 * /workout?date=…, and hardcoding "today" is what made backdating
 * impossible in the first place.
 */
function workoutPath(date: string, today: string): string {
  return date === today ? "/workout" : `/workout?date=${date}`;
}

export async function logSetAction(
  exerciseId: number,
  setNumber: number,
  reps: number,
  weightKg: number | null,
): Promise<typeof GONE | void> {
  await requireSession();
  // The exercise can be gone by the time a queued tap replays (removed
  // with "Not for me", or a different session): nothing to log against.
  if (!(await workoutExerciseExists(exerciseId))) return GONE;
  await logSet(exerciseId, { setNumber, reps, weightKg });
  refresh();
}

export async function unlogSetAction(
  exerciseId: number,
  setNumber: number,
): Promise<void> {
  await requireSession();
  await deleteSetLog(exerciseId, setNumber);
  refresh();
}

export async function shortenSession(date: string): Promise<void> {
  await requireSession();
  const workout = await getWorkoutByDate(date);
  if (!workout) return;
  const kept = shortenWorkout(workout.exercises);
  await setIncludedExercises(
    workout.id,
    kept.map((exercise) => exercise.id),
  );
  refresh();
}

export async function restoreFullSession(date: string): Promise<void> {
  await requireSession();
  const workout = await getWorkoutByDate(date);
  if (!workout) return;
  await includeAllExercises(workout.id);
  refresh();
}

export async function finishWorkout(date: string): Promise<void> {
  await requireSession();
  const workout = await getWorkoutByDate(date);
  if (!workout) return;
  await setWorkoutStatus(workout.id, "completed");
  const actions = await getDayActions(date);
  const workoutAction = actions.find(
    (action) => action.workoutId === workout.id,
  );
  if (workoutAction) await setActionStatus(workoutAction.id, "done");
  refresh();
  redirect(date === todayInTimeZone() ? "/" : "/workout/past?logged=1");
}

/**
 * Not today. Marks the session skipped rather than leaving it hanging
 * as planned forever — and because a skipped session doesn't consume
 * its rotation slot (T1), the same session comes round again rather
 * than being quietly lost from the fortnight.
 */
export async function skipSession(date: string): Promise<void> {
  await requireSession();
  const workout = await getWorkoutByDate(date);
  if (!workout) return;
  await setWorkoutStatus(workout.id, "skipped");

  const actions = await getDayActions(date);
  const workoutAction = actions.find(
    (action) => action.workoutId === workout.id,
  );
  if (workoutAction) await setActionStatus(workoutAction.id, "skipped");

  refresh();
  redirect(date === todayInTimeZone() ? "/?skipped=1" : "/workout/past");
}

/** Changed your mind — the session goes back to being today's. */
export async function unskipSession(date: string): Promise<void> {
  await requireSession();
  const workout = await getWorkoutByDate(date);
  if (!workout) return;
  await setWorkoutStatus(workout.id, "planned");

  const actions = await getDayActions(date);
  const workoutAction = actions.find(
    (action) => action.workoutId === workout.id,
  );
  if (workoutAction) await setActionStatus(workoutAction.id, "pending");

  refresh();
  redirect(workoutPath(date, todayInTimeZone()));
}

/**
 * Ask for a different session. generateDay deletes the day's workout
 * before rewriting it, which cascades to set logs — so this refuses
 * outright once anything is logged (T2). Adapting the session is the
 * right tool at that point, and it's already built.
 */
export async function resuggestSession(date: string): Promise<void> {
  await requireSession();
  const today = todayInTimeZone();
  const base = workoutPath(date, today);
  const join = base.includes("?") ? "&" : "?";

  const workout = await getWorkoutByDate(date);
  if (!workout) redirect(base);

  const logged = workout.exercises.some(
    (exercise) => exercise.sets.length > 0,
  );
  if (logged) redirect(`${base}${join}resuggest=logged`);

  await generateDay(date);
  refresh();
  redirect(`${base}${join}resuggest=done`);
}

export async function addPainFlagAction(
  location: string,
  severity: number,
): Promise<void> {
  await requireSession();
  await addPainFlag({ location, severity });
  refresh();
}

export async function resolvePainFlagAction(id: number): Promise<void> {
  await requireSession();
  await resolvePainFlag(id);
  refresh();
}

/**
 * "Not for me": the planner stops offering this exercise, and it comes
 * out of today's session if nothing has been logged against it. Undone
 * from Settings.
 */
export async function ruleOutExercise(
  workoutExerciseId: number,
  libraryExerciseId: string,
): Promise<void> {
  await requireSession();
  await upsertExerciseUserState({
    exerciseId: libraryExerciseId,
    preference: RULED_OUT_PREFERENCE,
  });
  await deleteUnloggedWorkoutExercise(workoutExerciseId);
  refresh();
  redirect("/workout?ruledOut=1");
}
