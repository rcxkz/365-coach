import { beforeAll, describe, expect, it } from "vitest";
import { EXERCISE_LIBRARY } from "../library";
import { upsertExercises } from "./exercises";
import {
  countCompletedBetween,
  getLatestReview,
  getPainForWeek,
  getSessionsBetween,
  getWeeklyReview,
  saveWeeklyReview,
} from "./reviews";
import { addPainFlag, resolvePainFlag } from "./pain";
import { createWorkout, logSet, setWorkoutStatus } from "./workouts";
import { summariseWeek } from "../../domain/week-review";

const WEEK_START = "2026-07-06";
const WEEK_END = "2026-07-12";

describe("reviews repo", () => {
  // workout_exercises.library_exercise_id is a real foreign key.
  beforeAll(async () => {
    await upsertExercises(EXERCISE_LIBRARY);
  });

  it("stores and reloads a review with its summary intact", async () => {
    const summary = summariseWeek({
      weekStart: WEEK_START,
      weekEnd: WEEK_END,
      sessions: [],
      pain: [],
      previousWeekSessions: 0,
    });
    const saved = await saveWeeklyReview({
      weekStart: WEEK_START,
      weekEnd: WEEK_END,
      narrative: "A quiet week.",
      summary,
      mode: "rules",
    });
    expect(saved.summary.sessionsCompleted).toBe(0);

    const loaded = await getWeeklyReview(WEEK_START);
    expect(loaded?.narrative).toBe("A quiet week.");
    expect(loaded?.summary.weekStart).toBe(WEEK_START);
  });

  it("rebuilds a week in place rather than duplicating it", async () => {
    const summary = summariseWeek({
      weekStart: WEEK_START,
      weekEnd: WEEK_END,
      sessions: [],
      pain: [],
      previousWeekSessions: 0,
    });
    await saveWeeklyReview({
      weekStart: WEEK_START,
      weekEnd: WEEK_END,
      narrative: "Rewritten by the coach.",
      summary,
      mode: "ai",
    });
    const loaded = await getWeeklyReview(WEEK_START);
    expect(loaded?.narrative).toBe("Rewritten by the coach.");
    expect(loaded?.mode).toBe("ai");
  });

  it("collects sessions with their logged sets", async () => {
    const workout = await createWorkout({
      date: "2026-07-08",
      title: "Upper Strength (Pull)",
      rotationKey: "A",
      templateId: "upper_strength",
      exercises: [
        {
          name: "Pull-Up",
          libraryExerciseId: "pull_up",
          targetSets: 2,
          targetReps: "6-8",
        },
      ],
    });
    await setWorkoutStatus(workout.id, "completed");
    await logSet(workout.exercises[0].id, { setNumber: 1, reps: 8 });
    await logSet(workout.exercises[0].id, { setNumber: 2, reps: 8 });

    const sessions = await getSessionsBetween(WEEK_START, WEEK_END);
    const session = sessions.find((s) => s.date === "2026-07-08");
    expect(session?.status).toBe("completed");
    expect(session?.exercises[0].sets).toHaveLength(2);
    expect(session?.exercises[0].libraryExerciseId).toBe("pull_up");

    expect(await countCompletedBetween(WEEK_START, WEEK_END)).toBe(1);
  });

  it("excludes sessions outside the window", async () => {
    await createWorkout({
      date: "2026-08-20",
      title: "Later session",
      exercises: [],
    });
    const sessions = await getSessionsBetween(WEEK_START, WEEK_END);
    expect(sessions.every((s) => s.date <= WEEK_END)).toBe(true);
  });

  it("includes pain that was open during the week, resolved or not", async () => {
    const flag = await addPainFlag({ location: "shoulder", severity: 3 });
    const open = await getPainForWeek("2020-01-01", "2030-01-01");
    expect(open.some((p) => p.location === "shoulder")).toBe(true);

    await resolvePainFlag(flag.id);
    const afterResolve = await getPainForWeek("2020-01-01", "2030-01-01");
    const shoulder = afterResolve.find((p) => p.location === "shoulder");
    expect(shoulder?.resolvedOn).not.toBeNull();
  });

  it("returns the most recent review for the planner", async () => {
    const summary = summariseWeek({
      weekStart: "2026-07-13",
      weekEnd: "2026-07-19",
      sessions: [],
      pain: [],
      previousWeekSessions: 1,
    });
    await saveWeeklyReview({
      weekStart: "2026-07-13",
      weekEnd: "2026-07-19",
      narrative: "Newer week.",
      summary,
      mode: "rules",
    });
    const latest = await getLatestReview();
    expect(latest?.weekStart).toBe("2026-07-13");
  });
});
