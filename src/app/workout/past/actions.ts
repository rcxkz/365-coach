"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDayActions, setActionStatus } from "@/data/repos/today";
import { getWorkoutByDate, setWorkoutStatus } from "@/data/repos/workouts";
import { requireSession } from "@/lib/require-session";

/**
 * The failsafe (decision T3): one tap says a day was trained.
 *
 * It records attendance, not volume — a session marked this way keeps
 * zero sets, and the weekly review goes on saying so (T4). Progression
 * calls need real numbers, and inventing them to make a screen look
 * tidier would poison every call that follows.
 */
export async function markTrained(date: string): Promise<void> {
  await requireSession();
  const workout = await getWorkoutByDate(date);
  if (!workout) return;
  await setWorkoutStatus(workout.id, "completed");

  const actions = await getDayActions(date);
  const workoutAction = actions.find(
    (action) => action.workoutId === workout.id,
  );
  if (workoutAction) await setActionStatus(workoutAction.id, "done");

  revalidatePath("/workout/past");
  revalidatePath("/");
  redirect("/workout/past?logged=1");
}

/** Undo — it wasn't trained after all. */
export async function unmarkTrained(date: string): Promise<void> {
  await requireSession();
  const workout = await getWorkoutByDate(date);
  if (!workout) return;
  await setWorkoutStatus(workout.id, "planned");

  const actions = await getDayActions(date);
  const workoutAction = actions.find(
    (action) => action.workoutId === workout.id,
  );
  if (workoutAction) await setActionStatus(workoutAction.id, "pending");

  revalidatePath("/workout/past");
  revalidatePath("/");
  redirect("/workout/past");
}
