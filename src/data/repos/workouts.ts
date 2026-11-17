import { and, asc, count, desc, eq, inArray, isNotNull, lt, ne, or } from "drizzle-orm";
import { getDb } from "../db";
import {
  setLogs,
  workoutExercises,
  workouts,
  type WorkoutStatus,
} from "../schema";

export type Workout = typeof workouts.$inferSelect;
export type WorkoutExercise = typeof workoutExercises.$inferSelect;
export type SetLog = typeof setLogs.$inferSelect;

export type ExerciseWithSets = WorkoutExercise & { sets: SetLog[] };
export type WorkoutWithExercises = Workout & { exercises: ExerciseWithSets[] };

export type NewExercise = {
  name: string;
  libraryExerciseId?: string | null;
  targetSets: number;
  targetReps: string;
  targetWeightKg?: number | null;
  inShortVersion?: boolean;
  note?: string | null;
};

export async function createWorkout(input: {
  date: string;
  title: string;
  focus?: string | null;
  rationale?: string | null;
  durationMinutes?: number | null;
  rotationKey?: string | null;
  templateId?: string | null;
  returnSession?: number | null;
  exercises: NewExercise[];
}): Promise<WorkoutWithExercises> {
  const db = await getDb();
  const [workout] = await db
    .insert(workouts)
    .values({
      date: input.date,
      title: input.title,
      focus: input.focus ?? null,
      rationale: input.rationale ?? null,
      durationMinutes: input.durationMinutes ?? null,
      rotationKey: input.rotationKey ?? null,
      templateId: input.templateId ?? null,
      returnSession: input.returnSession ?? null,
    })
    .returning();

  const exercises = input.exercises.length
    ? await db
        .insert(workoutExercises)
        .values(
          input.exercises.map((exercise, index) => ({
            workoutId: workout.id,
            position: index,
            name: exercise.name,
            libraryExerciseId: exercise.libraryExerciseId ?? null,
            targetSets: exercise.targetSets,
            targetReps: exercise.targetReps,
            targetWeightKg: exercise.targetWeightKg ?? null,
            inShortVersion: exercise.inShortVersion ?? false,
            note: exercise.note ?? null,
          })),
        )
        .returning()
    : [];

  return {
    ...workout,
    exercises: exercises.map((exercise) => ({ ...exercise, sets: [] })),
  };
}

export async function getWorkoutByDate(
  date: string,
): Promise<WorkoutWithExercises | null> {
  const db = await getDb();
  const [workout] = await db
    .select()
    .from(workouts)
    .where(eq(workouts.date, date))
    .limit(1);
  if (!workout) return null;

  const exercises = await db
    .select()
    .from(workoutExercises)
    .where(eq(workoutExercises.workoutId, workout.id))
    .orderBy(asc(workoutExercises.position));

  const exerciseIds = exercises.map((exercise) => exercise.id);
  const sets = exerciseIds.length
    ? await db
        .select()
        .from(setLogs)
        .where(inArray(setLogs.exerciseId, exerciseIds))
        .orderBy(asc(setLogs.setNumber))
    : [];

  return {
    ...workout,
    exercises: exercises.map((exercise) => ({
      ...exercise,
      sets: sets.filter((set) => set.exerciseId === exercise.id),
    })),
  };
}

export async function logSet(
  exerciseId: number,
  input: { setNumber: number; reps: number; weightKg?: number | null },
): Promise<SetLog> {
  const db = await getDb();
  const [row] = await db
    .insert(setLogs)
    .values({
      exerciseId,
      setNumber: input.setNumber,
      reps: input.reps,
      weightKg: input.weightKg ?? null,
    })
    .onConflictDoUpdate({
      target: [setLogs.exerciseId, setLogs.setNumber],
      set: {
        reps: input.reps,
        weightKg: input.weightKg ?? null,
        completedAt: new Date(),
      },
    })
    .returning();
  return row;
}

/**
 * Rotation keys of the most recent sessions, newest first — the input
 * to least-recently-done selection. Pre-P2 workouts (null key) are
 * skipped. `excludeDate` keeps the day being (re)planned from counting
 * as its own history, so re-planning never advances the rotation.
 */
export async function getRecentRotationKeys(
  excludeDate?: string,
  limit = 14,
): Promise<string[]> {
  const db = await getDb();
  const conditions = [
    isNotNull(workouts.rotationKey),
    // A skipped session doesn't consume its slot (decision T1) — you
    // didn't do it, so it stays due and comes round again. Counting it
    // would quietly delete a session type from the fortnight because of
    // one bad day.
    ne(workouts.status, "skipped"),
  ];
  if (excludeDate) conditions.push(ne(workouts.date, excludeDate));
  const rows = await db
    .select({ rotationKey: workouts.rotationKey })
    .from(workouts)
    .where(and(...conditions))
    .orderBy(desc(workouts.date))
    .limit(limit);
  return rows
    .map((row) => row.rotationKey)
    .filter((key): key is string => key !== null);
}

/**
 * Days that were actually trained before `before`, newest first: the
 * session was finished, or at least one set was logged. A planned day
 * that never happened isn't training, and neither is a skipped one.
 */
export async function listTrainedDates(
  before: string,
  limit = 60,
): Promise<string[]> {
  const db = await getDb();
  const rows = await db
    .selectDistinct({ date: workouts.date })
    .from(workouts)
    .leftJoin(workoutExercises, eq(workoutExercises.workoutId, workouts.id))
    .leftJoin(setLogs, eq(setLogs.exerciseId, workoutExercises.id))
    .where(
      and(
        lt(workouts.date, before),
        or(eq(workouts.status, "completed"), isNotNull(setLogs.id)),
      ),
    )
    .orderBy(desc(workouts.date))
    .limit(limit);
  return rows.map((row) => row.date);
}

export type RecentWorkout = {
  id: number;
  date: string;
  title: string;
  status: WorkoutStatus;
  setsLogged: number;
};

/**
 * Sessions before `before`, newest first — the backdating list. Carries
 * the set count so a day that was trained but never logged is visible
 * as exactly that rather than looking identical to one that was missed.
 */
export async function listRecentWorkouts(
  before: string,
  limit = 14,
): Promise<RecentWorkout[]> {
  const db = await getDb();
  const rows = await db
    .select({
      id: workouts.id,
      date: workouts.date,
      title: workouts.title,
      status: workouts.status,
    })
    .from(workouts)
    .where(lt(workouts.date, before))
    .orderBy(desc(workouts.date))
    .limit(limit);

  if (rows.length === 0) return [];

  const counts = await db
    .select({
      workoutId: workoutExercises.workoutId,
      sets: count(setLogs.id),
    })
    .from(workoutExercises)
    .leftJoin(setLogs, eq(setLogs.exerciseId, workoutExercises.id))
    .where(
      inArray(
        workoutExercises.workoutId,
        rows.map((row) => row.id),
      ),
    )
    .groupBy(workoutExercises.workoutId);

  const byWorkout = new Map(counts.map((row) => [row.workoutId, row.sets]));
  return rows.map((row) => ({
    ...row,
    setsLogged: byWorkout.get(row.id) ?? 0,
  }));
}

/** Un-logs a set (tap-again undo); no-op if it was never logged. */
export async function deleteSetLog(
  exerciseId: number,
  setNumber: number,
): Promise<void> {
  const db = await getDb();
  await db
    .delete(setLogs)
    .where(
      and(eq(setLogs.exerciseId, exerciseId), eq(setLogs.setNumber, setNumber)),
    );
}

/** Removes a day's workout (cascades exercises + logs); no-op if absent. */
export async function deleteWorkoutByDate(date: string): Promise<void> {
  const db = await getDb();
  await db.delete(workouts).where(eq(workouts.date, date));
}

/** Shorten the session: only `includedIds` stay in today's plan. */
export async function setIncludedExercises(
  workoutId: number,
  includedIds: number[],
): Promise<void> {
  const db = await getDb();
  await db
    .update(workoutExercises)
    .set({ included: false })
    .where(eq(workoutExercises.workoutId, workoutId));
  if (includedIds.length) {
    await db
      .update(workoutExercises)
      .set({ included: true })
      .where(inArray(workoutExercises.id, includedIds));
  }
}

/** Removes one planned exercise, unless sets have been logged against it. */
export async function deleteUnloggedWorkoutExercise(id: number): Promise<boolean> {
  const db = await getDb();
  const [logged] = await db
    .select({ id: setLogs.id })
    .from(setLogs)
    .where(eq(setLogs.exerciseId, id))
    .limit(1);
  if (logged) return false;
  await db.delete(workoutExercises).where(eq(workoutExercises.id, id));
  return true;
}

/** Restore the full session. */
export async function includeAllExercises(workoutId: number): Promise<void> {
  const db = await getDb();
  await db
    .update(workoutExercises)
    .set({ included: true })
    .where(eq(workoutExercises.workoutId, workoutId));
}

/** Applies a planned-exercise edit (morning adaptation). */
export async function updateWorkoutExercise(
  id: number,
  fields: {
    libraryExerciseId?: string | null;
    name?: string;
    targetSets?: number;
    targetReps?: string;
    targetWeightKg?: number | null;
    note?: string | null;
    included?: boolean;
  },
): Promise<void> {
  const db = await getDb();
  await db.update(workoutExercises).set(fields).where(eq(workoutExercises.id, id));
}

export async function setWorkoutNotes(
  id: number,
  notes: string | null,
): Promise<void> {
  const db = await getDb();
  await db.update(workouts).set({ notes }).where(eq(workouts.id, id));
}

/**
 * Most recent logged sets per library exercise, for progression
 * decisions ("what did I do last time"). Keyed by library exercise id.
 */
export async function getLastPerformance(
  libraryExerciseIds: string[],
): Promise<Map<string, { date: string; sets: SetLog[] }>> {
  const result = new Map<string, { date: string; sets: SetLog[] }>();
  if (libraryExerciseIds.length === 0) return result;

  const db = await getDb();
  const rows = await db
    .select({
      libraryExerciseId: workoutExercises.libraryExerciseId,
      date: workouts.date,
      set: setLogs,
    })
    .from(setLogs)
    .innerJoin(workoutExercises, eq(setLogs.exerciseId, workoutExercises.id))
    .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id))
    .where(inArray(workoutExercises.libraryExerciseId, libraryExerciseIds))
    .orderBy(desc(workouts.date), asc(setLogs.setNumber));

  for (const row of rows) {
    const key = row.libraryExerciseId;
    if (!key) continue;
    const existing = result.get(key);
    if (!existing) {
      result.set(key, { date: row.date, sets: [row.set] });
    } else if (existing.date === row.date) {
      existing.sets.push(row.set);
    }
  }
  return result;
}

export async function setWorkoutStatus(
  id: number,
  status: WorkoutStatus,
): Promise<void> {
  const db = await getDb();
  await db.update(workouts).set({ status }).where(eq(workouts.id, id));
}

export async function updateWorkoutDuration(
  id: number,
  minutes: number,
): Promise<void> {
  const db = await getDb();
  await db
    .update(workouts)
    .set({ durationMinutes: minutes })
    .where(eq(workouts.id, id));
}
