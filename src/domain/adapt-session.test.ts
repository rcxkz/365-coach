import { describe, expect, it } from "vitest";
import { adaptSession, type PlannedExercise } from "./adapt-session";
import type { ExerciseDefinition } from "./exercises";

function def(overrides: Partial<ExerciseDefinition>): ExerciseDefinition {
  return {
    id: "x",
    name: "X",
    category: "strength",
    movementPattern: "vertical_push",
    bodyRegion: "upper",
    equipment: ["barbell"],
    goals: ["general_strength"],
    difficulty: 3,
    riskLevel: 2,
    recoveryCost: 2,
    setsMin: 3,
    setsMax: 5,
    repsTarget: "6-10",
    restSeconds: 120,
    placements: ["primary"],
    cues: "Cue.",
    ...overrides,
  };
}

const LIBRARY = new Map<string, ExerciseDefinition>([
  [
    "overhead_press",
    def({
      id: "overhead_press",
      name: "Overhead Press",
      avoidAreas: ["shoulder"],
      riskLevel: 3,
      regressions: ["landmine_press"],
      substitutions: ["machine_press"],
    }),
  ],
  [
    "landmine_press",
    def({
      id: "landmine_press",
      name: "Landmine Press",
      riskLevel: 1,
      cautionAreas: ["shoulder"],
    }),
  ],
  [
    "machine_press",
    def({ id: "machine_press", name: "Machine Press", riskLevel: 1 }),
  ],
  [
    "deadlift",
    def({
      id: "deadlift",
      name: "Deadlift",
      avoidAreas: ["lower_back"],
      riskLevel: 4,
      recoveryCost: 5,
      regressions: [],
      substitutions: [],
    }),
  ],
  [
    "squat",
    def({ id: "squat", name: "Squat", recoveryCost: 4, riskLevel: 3 }),
  ],
]);

function planned(overrides: Partial<PlannedExercise>): PlannedExercise {
  return {
    id: 1,
    libraryExerciseId: "squat",
    name: "Squat",
    targetSets: 4,
    included: true,
    ...overrides,
  };
}

describe("adaptSession", () => {
  it("makes no changes on a green day with no pain", () => {
    const adjustments = adaptSession(
      [planned({}), planned({ id: 2, libraryExerciseId: "machine_press" })],
      LIBRARY,
      { readiness: "green", painFlags: [] },
    );
    expect(adjustments).toEqual([]);
  });

  it("substitutes an exercise that loads a painful area", () => {
    const adjustments = adaptSession(
      [planned({ id: 7, libraryExerciseId: "overhead_press", name: "Overhead Press" })],
      LIBRARY,
      { readiness: "green", painFlags: [{ location: "shoulder", severity: 3 }] },
    );
    expect(adjustments).toHaveLength(1);
    const [adjustment] = adjustments;
    expect(adjustment.action).toBe("substitute");
    if (adjustment.action !== "substitute") throw new Error("expected swap");
    // Regression is preferred over substitution (doc 14).
    expect(adjustment.libraryExerciseId).toBe("landmine_press");
    expect(adjustment.reason).toMatch(/loads the shoulder/);
  });

  it("drops an aggravating exercise with no safe alternative", () => {
    const adjustments = adaptSession(
      [planned({ id: 9, libraryExerciseId: "deadlift", name: "Deadlift" })],
      LIBRARY,
      {
        readiness: "green",
        painFlags: [{ location: "lower_back", severity: 4 }],
      },
    );
    expect(adjustments[0].action).toBe("drop");
    expect(adjustments[0].reason).toMatch(/left out today/);
  });

  it("ignores mild pain below the exclusion threshold", () => {
    const adjustments = adaptSession(
      [planned({ id: 7, libraryExerciseId: "overhead_press" })],
      LIBRARY,
      { readiness: "green", painFlags: [{ location: "shoulder", severity: 2 }] },
    );
    expect(adjustments).toEqual([]);
  });

  it("trims a set from high-cost work on a yellow day", () => {
    const adjustments = adaptSession([planned({ targetSets: 4 })], LIBRARY, {
      readiness: "yellow",
      painFlags: [],
    });
    expect(adjustments[0]).toMatchObject({
      action: "reduce_sets",
      targetSets: 3,
    });
  });

  it("never trims below the minimum working sets", () => {
    const adjustments = adaptSession([planned({ targetSets: 2 })], LIBRARY, {
      readiness: "yellow",
      painFlags: [],
    });
    expect(adjustments).toEqual([]);
  });

  it("swaps out exercises exceeding the yellow risk allowance", () => {
    const adjustments = adaptSession(
      [planned({ id: 9, libraryExerciseId: "deadlift", name: "Deadlift" })],
      LIBRARY,
      { readiness: "yellow", painFlags: [] },
    );
    expect(adjustments[0].action).toBe("drop");
    expect(adjustments[0].reason).toMatch(/readiness/);
  });

  it("skips excluded exercises and unknown library ids", () => {
    const adjustments = adaptSession(
      [
        planned({ id: 3, included: false, targetSets: 5 }),
        planned({ id: 4, libraryExerciseId: null }),
        planned({ id: 5, libraryExerciseId: "not_in_library" }),
      ],
      LIBRARY,
      { readiness: "yellow", painFlags: [{ location: "shoulder", severity: 4 }] },
    );
    expect(adjustments).toEqual([]);
  });

  it("does not reuse an exercise already in the session as a replacement", () => {
    const adjustments = adaptSession(
      [
        planned({ id: 7, libraryExerciseId: "overhead_press", name: "Overhead Press" }),
        planned({ id: 8, libraryExerciseId: "landmine_press", name: "Landmine Press" }),
      ],
      LIBRARY,
      { readiness: "green", painFlags: [{ location: "shoulder", severity: 3 }] },
    );
    const swap = adjustments[0];
    if (swap.action !== "substitute") throw new Error("expected swap");
    expect(swap.libraryExerciseId).toBe("machine_press");
  });
});
