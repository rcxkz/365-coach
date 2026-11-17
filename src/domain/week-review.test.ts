import { describe, expect, it } from "vitest";
import {
  summariseWeek,
  type ReviewExercise,
  type ReviewSession,
  type WeekInput,
} from "./week-review";

function exercise(overrides: Partial<ReviewExercise> = {}): ReviewExercise {
  return {
    libraryExerciseId: "pull_up",
    name: "Pull-Up",
    targetSets: 3,
    targetReps: "6-8",
    included: true,
    sets: [{ reps: 8, weightKg: null }, { reps: 8, weightKg: null }, { reps: 8, weightKg: null }],
    ...overrides,
  };
}

function session(overrides: Partial<ReviewSession> = {}): ReviewSession {
  return {
    date: "2026-07-27",
    title: "Upper Strength (Pull)",
    status: "completed",
    rotationKey: "A",
    exercises: [exercise()],
    ...overrides,
  };
}

function input(overrides: Partial<WeekInput> = {}): WeekInput {
  return {
    weekStart: "2026-07-27",
    weekEnd: "2026-08-02",
    sessions: [session()],
    pain: [],
    previousWeekSessions: 0,
    ...overrides,
  };
}

describe("summariseWeek", () => {
  it("counts completed sessions and logged sets", () => {
    const summary = summariseWeek(
      input({
        sessions: [
          session(),
          session({ date: "2026-07-29", status: "planned", exercises: [exercise({ sets: [] })] }),
        ],
      }),
    );
    expect(summary.sessionsCompleted).toBe(1);
    expect(summary.setsLogged).toBe(3);
  });

  it("suggests progression when every set cleared the target", () => {
    const summary = summariseWeek(input());
    expect(summary.progressions).toHaveLength(1);
    expect(summary.progressions[0]).toMatchObject({
      libraryExerciseId: "pull_up",
      call: "progress",
    });
  });

  it("holds when sets came up short", () => {
    const summary = summariseWeek(
      input({
        sessions: [
          session({
            exercises: [
              exercise({ sets: [{ reps: 8, weightKg: null }, { reps: 5, weightKg: null }, { reps: 4, weightKg: null }] }),
            ],
          }),
        ],
      }),
    );
    expect(summary.progressions[0].call).toBe("hold");
  });

  it("eases off when reps fell short while pain was open", () => {
    const summary = summariseWeek(
      input({
        sessions: [
          session({
            exercises: [
              exercise({ sets: [{ reps: 4, weightKg: null }, { reps: 4, weightKg: null }] }),
            ],
          }),
        ],
        pain: [
          { location: "shoulder", severity: 3, openedOn: "2026-07-27", resolvedOn: null },
        ],
      }),
    );
    expect(summary.progressions[0].call).toBe("ease");
    expect(summary.progressions[0].reason).toMatch(/regression/);
  });

  it("ignores exercises that were never logged", () => {
    const summary = summariseWeek(
      input({ sessions: [session({ exercises: [exercise({ sets: [] })] })] }),
    );
    expect(summary.progressions).toEqual([]);
  });

  it("names specific wins, including the week's heaviest set", () => {
    const summary = summariseWeek(
      input({
        sessions: [
          session({
            exercises: [
              exercise(),
              exercise({
                libraryExerciseId: "romanian_deadlift",
                name: "Romanian Deadlift",
                targetReps: "8",
                sets: [{ reps: 8, weightKg: 60 }, { reps: 8, weightKg: 60 }, { reps: 8, weightKg: 60 }],
              }),
            ],
          }),
        ],
      }),
    );
    expect(summary.wins.some((win) => win.includes("Romanian Deadlift 8 × 60kg"))).toBe(true);
  });

  it("celebrates a resolved pain flag", () => {
    const summary = summariseWeek(
      input({
        pain: [
          { location: "lower_back", severity: 3, openedOn: "2026-07-20", resolvedOn: "2026-07-29" },
        ],
      }),
    );
    expect(summary.wins).toContain("lower back pain cleared.");
  });

  it("compares with last week only when it's an increase", () => {
    const up = summariseWeek(
      input({ sessions: [session(), session({ date: "2026-07-28" })], previousWeekSessions: 1 }),
    );
    expect(up.wins.some((win) => win.includes("more than last week"))).toBe(true);

    const down = summariseWeek(input({ previousWeekSessions: 4 }));
    expect(down.wins.some((win) => win.includes("last week"))).toBe(false);
  });

  it("flags severe pain for assessment rather than adaptation", () => {
    const summary = summariseWeek(
      input({
        pain: [
          { location: "knee", severity: 4, openedOn: "2026-07-28", resolvedOn: null },
        ],
      }),
    );
    expect(summary.watchouts[0]).toMatch(/assessed/);
  });

  it("frames unlogged plans without debt language", () => {
    const summary = summariseWeek(
      input({
        sessions: [
          session({ status: "planned", exercises: [exercise({ sets: [] })] }),
          session({ date: "2026-07-28", status: "planned", exercises: [exercise({ sets: [] })] }),
          session({ date: "2026-07-29", status: "planned", exercises: [exercise({ sets: [] })] }),
        ],
      }),
    );
    const note = summary.watchouts.find((w) => w.includes("weren't logged"));
    expect(note).toMatch(/not a debt/);
  });

  it("says nothing rather than padding an empty week", () => {
    const summary = summariseWeek(input({ sessions: [], previousWeekSessions: 2 }));
    expect(summary.wins).toEqual([]);
    expect(summary.progressions).toEqual([]);
    expect(summary.sessionsCompleted).toBe(0);
  });
});
