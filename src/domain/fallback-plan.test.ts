import { describe, expect, it } from "vitest";
import { buildSessionCandidates } from "./candidates";
import { composeFallbackSession } from "./fallback-plan";
import { SESSION_TEMPLATES } from "./templates";
// Domain tests may not import the data layer; the compat test in
// src/data/library covers the real library. Here we use a small pool.
import type { ExerciseDefinition } from "./exercises";

const POOL: ExerciseDefinition[] = [
  {
    id: "easy_pull",
    name: "Easy Pull",
    category: "strength",
    movementPattern: "vertical_pull",
    bodyRegion: "upper",
    equipment: ["cable"],
    goals: ["general_strength"],
    difficulty: 1,
    riskLevel: 1,
    recoveryCost: 2,
    setsMin: 3,
    setsMax: 4,
    repsTarget: "8-12",
    restSeconds: 90,
    placements: ["primary", "secondary"],
    cues: "Pull smooth.",
  },
  {
    id: "hard_pull",
    name: "Hard Pull",
    category: "calisthenics",
    movementPattern: "vertical_pull",
    bodyRegion: "upper",
    equipment: ["pull_up_bar"],
    goals: ["muscle_up"],
    difficulty: 3,
    riskLevel: 2,
    recoveryCost: 3,
    setsMin: 3,
    setsMax: 5,
    repsTarget: "5-10",
    restSeconds: 150,
    placements: ["primary", "secondary"],
    cues: "Full hang.",
  },
  {
    id: "expert_pull",
    name: "Expert Pull",
    category: "calisthenics",
    movementPattern: "vertical_pull",
    bodyRegion: "upper",
    equipment: ["pull_up_bar"],
    goals: ["muscle_up"],
    difficulty: 4,
    riskLevel: 3,
    recoveryCost: 4,
    setsMin: 3,
    setsMax: 5,
    repsTarget: "3-6",
    restSeconds: 180,
    placements: ["primary"],
    cues: "Explode.",
  },
];

const SECTION = {
  role: "Primary Pull",
  placements: ["primary" as const],
  patterns: ["vertical_pull" as const],
  count: 1,
};

function sectionsFor(count: number) {
  return [
    {
      section: { ...SECTION, count },
      candidates: POOL.map((exercise) => ({ exercise, cautions: [] })),
    },
  ];
}

const TEMPLATE = SESSION_TEMPLATES[0];

describe("composeFallbackSession", () => {
  it("picks the hardest option within the difficulty/risk cap", () => {
    const [exercise] = composeFallbackSession(TEMPLATE, sectionsFor(1));
    // expert_pull (difficulty 4) is over the cap; hard_pull wins.
    expect(exercise.libraryExerciseId).toBe("hard_pull");
    expect(exercise.targetSets).toBe(3);
    expect(exercise.targetReps).toBe("5-10");
    expect(exercise.inShortVersion).toBe(true);
    expect(exercise.note).toBe("Full hang.");
  });

  it("never repeats an exercise across slots", () => {
    const exercises = composeFallbackSession(TEMPLATE, sectionsFor(3));
    const ids = exercises.map((e) => e.libraryExerciseId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("skips optional sections and tolerates empty candidate lists", () => {
    const exercises = composeFallbackSession(TEMPLATE, [
      { section: { ...SECTION, optional: true }, candidates: [] },
      { section: { ...SECTION, role: "Accessory Push" }, candidates: [] },
    ]);
    expect(exercises).toEqual([]);
  });

  it("carries pain cautions into the exercise note", () => {
    const sections = [
      {
        section: SECTION,
        candidates: [
          {
            exercise: POOL[1],
            cautions: ["Mild wrist pain — keep loading gentle."],
          },
        ],
      },
    ];
    const [exercise] = composeFallbackSession(TEMPLATE, sections);
    expect(exercise.note).toBe("Full hang.\nMild wrist pain — keep loading gentle.");
  });

  it("picks the gentlest option for warm-up/restoration sections", () => {
    const gentleSection = {
      role: "Restoration",
      placements: ["restoration" as const],
      count: 1,
    };
    const sections = [
      {
        section: gentleSection,
        candidates: [
          {
            exercise: {
              ...POOL[0],
              id: "harder_restoration",
              difficulty: 2,
              recoveryCost: 1,
              placements: ["restoration" as const],
            },
            cautions: [],
          },
          {
            exercise: {
              ...POOL[0],
              id: "gentle_restoration",
              difficulty: 1,
              recoveryCost: 1,
              placements: ["restoration" as const],
            },
            cautions: [],
          },
        ],
      },
    ];
    const [exercise] = composeFallbackSession(TEMPLATE, sections);
    expect(exercise.libraryExerciseId).toBe("gentle_restoration");
  });

  it("falls back to lowest risk when everything exceeds the cap", () => {
    const sections = [
      {
        section: SECTION,
        candidates: [
          { exercise: { ...POOL[2], id: "risky_a", riskLevel: 5 }, cautions: [] },
          { exercise: { ...POOL[2], id: "risky_b", riskLevel: 4 }, cautions: [] },
        ],
      },
    ];
    const [exercise] = composeFallbackSession(TEMPLATE, sections);
    expect(exercise.libraryExerciseId).toBe("risky_b");
  });

  it("composes a complete upper-strength session from real-shaped sections", () => {
    const upper = SESSION_TEMPLATES.find((t) => t.id === "upper_strength");
    if (!upper) throw new Error("missing template");
    const sections = buildSessionCandidates(upper, POOL, {
      painFlags: [],
      readiness: "green",
    });
    const exercises = composeFallbackSession(upper, sections);
    // Only pull work exists in this tiny pool, but every filled slot is valid.
    expect(exercises.length).toBeGreaterThan(0);
    for (const exercise of exercises) {
      expect(exercise.targetSets).toBeGreaterThan(0);
      expect(exercise.name.length).toBeGreaterThan(0);
    }
  });
});
