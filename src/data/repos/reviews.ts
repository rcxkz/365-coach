import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { getDb } from "../db";
import { todayInTimeZone } from "@/domain/dates";
import {
  painFlags,
  setLogs,
  weeklyReviews,
  workoutExercises,
  workouts,
} from "../schema";
import type { ReviewSession, WeekSummary } from "../../domain/week-review";

export type WeeklyReview = typeof weeklyReviews.$inferSelect;

/** A stored review with its summary parsed back into shape. */
export interface StoredReview extends Omit<WeeklyReview, "summary"> {
  summary: WeekSummary;
}

function parse(row: WeeklyReview): StoredReview {
  return { ...row, summary: JSON.parse(row.summary) as WeekSummary };
}

export async function saveWeeklyReview(input: {
  weekStart: string;
  weekEnd: string;
  narrative: string;
  summary: WeekSummary;
  mode: "ai" | "rules";
}): Promise<StoredReview> {
  const db = await getDb();
  const [row] = await db
    .insert(weeklyReviews)
    .values({
      weekStart: input.weekStart,
      weekEnd: input.weekEnd,
      narrative: input.narrative,
      summary: JSON.stringify(input.summary),
      mode: input.mode,
    })
    .onConflictDoUpdate({
      target: weeklyReviews.weekStart,
      set: {
        weekEnd: input.weekEnd,
        narrative: input.narrative,
        summary: JSON.stringify(input.summary),
        mode: input.mode,
        createdAt: new Date(),
      },
    })
    .returning();
  return parse(row);
}

export async function getWeeklyReview(
  weekStart: string,
): Promise<StoredReview | null> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(weeklyReviews)
    .where(eq(weeklyReviews.weekStart, weekStart))
    .limit(1);
  return row ? parse(row) : null;
}

/** Most recent review, whichever week it covers. */
export async function getLatestReview(): Promise<StoredReview | null> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(weeklyReviews)
    .orderBy(desc(weeklyReviews.weekStart))
    .limit(1);
  return row ? parse(row) : null;
}

export async function listWeeklyReviews(limit = 8): Promise<StoredReview[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(weeklyReviews)
    .orderBy(desc(weeklyReviews.weekStart))
    .limit(limit);
  return rows.map(parse);
}

/** Sessions in a date range, with their exercises and logged sets. */
export async function getSessionsBetween(
  from: string,
  to: string,
): Promise<ReviewSession[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(workouts)
    .where(and(gte(workouts.date, from), lte(workouts.date, to)))
    .orderBy(asc(workouts.date));
  if (rows.length === 0) return [];

  const sessions: ReviewSession[] = [];
  for (const workout of rows) {
    const exercises = await db
      .select()
      .from(workoutExercises)
      .where(eq(workoutExercises.workoutId, workout.id))
      .orderBy(asc(workoutExercises.position));

    const withSets = await Promise.all(
      exercises.map(async (exercise) => {
        const sets = await db
          .select()
          .from(setLogs)
          .where(eq(setLogs.exerciseId, exercise.id))
          .orderBy(asc(setLogs.setNumber));
        return {
          libraryExerciseId: exercise.libraryExerciseId,
          name: exercise.name,
          targetSets: exercise.targetSets,
          targetReps: exercise.targetReps,
          included: exercise.included,
          sets: sets.map((set) => ({ reps: set.reps, weightKg: set.weightKg })),
        };
      }),
    );

    sessions.push({
      date: workout.date,
      title: workout.title,
      status: workout.status,
      rotationKey: workout.rotationKey,
      exercises: withSets,
    });
  }
  return sessions;
}

/**
 * Pain flags opened before the window closed and not resolved before it
 * opened, with days in the user's time zone. A flag resolved after the
 * week ended was still open that week, so it reads as unresolved: the
 * review mustn't call it "cleared", or step up the exercises it touches.
 */
export async function getPainForWeek(
  from: string,
  to: string,
): Promise<
  { location: string; severity: number; openedOn: string; resolvedOn: string | null }[]
> {
  const db = await getDb();
  const rows = await db.select().from(painFlags).orderBy(desc(painFlags.createdAt));
  const day = (moment: Date) => todayInTimeZone(undefined, moment);

  return rows
    .map((flag) => ({
      flag,
      openedOn: day(flag.createdAt),
      resolvedOn: flag.resolvedAt ? day(flag.resolvedAt) : null,
    }))
    .filter(({ openedOn, resolvedOn }) => openedOn <= to && (resolvedOn === null || resolvedOn >= from))
    .map(({ flag, openedOn, resolvedOn }) => ({
      location: flag.location,
      severity: flag.severity,
      openedOn,
      resolvedOn: resolvedOn !== null && resolvedOn <= to ? resolvedOn : null,
    }));
}

export async function countCompletedBetween(
  from: string,
  to: string,
): Promise<number> {
  const db = await getDb();
  const rows = await db
    .select({ id: workouts.id })
    .from(workouts)
    .where(
      and(
        eq(workouts.status, "completed"),
        gte(workouts.date, from),
        lte(workouts.date, to),
      ),
    );
  return rows.length;
}
