import { describe, expect, it } from "vitest";
import { buildSessionPrompt, type SessionPromptContext } from "./session-prompt";
import type { ExerciseDefinition } from "@/domain/exercises";
import { SESSION_TEMPLATES } from "@/domain/templates";

function def(overrides: Partial<ExerciseDefinition>): ExerciseDefinition {
  return {
    id: "pull_up",
    name: "Pull-Up",
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
    placements: ["primary"],
    cues: "Full hang.",
    ...overrides,
  };
}

const template = SESSION_TEMPLATES[0];

function context(
  overrides: Partial<SessionPromptContext> = {},
): SessionPromptContext {
  return {
    targetDate: "2026-07-28",
    entry: {
      key: "A",
      label: "Upper Strength (Pull)",
      templateId: "upper_strength",
      emphasis: "Pull-dominant.",
    },
    template,
    sections: [
      {
        section: {
          role: "Primary Pull",
          placements: ["primary"],
          count: 1,
        },
        candidates: [
          { exercise: def({}), cautions: [] },
          {
            exercise: def({ id: "chin_up", name: "Chin-Up" }),
            cautions: ["Mild wrist pain — keep loading gentle."],
          },
        ],
      },
      {
        section: {
          role: "Conditioning",
          placements: ["conditioning"],
          count: 1,
          optional: true,
        },
        candidates: [
          { exercise: def({ id: "zone2_cycle", name: "Zone 2 Cycle" }), cautions: [] },
        ],
      },
      {
        section: { role: "Empty", placements: ["skill"], count: 1 },
        candidates: [],
      },
    ],
    memories: ["Loose knees — keep tempo controlled."],
    openPain: ["wrist (2/5)"],
    readinessReasons: ["Short on sleep."],
    recentSessions: ["2026-07-27 Upper Strength (completed): Pull-Up 8/8/7"],
    lastPerformance: { pull_up: "2026-07-27: 8, 8, 7" },
    ...overrides,
  };
}

describe("buildSessionPrompt", () => {
  it("names the rotation session, template and emphasis", () => {
    const prompt = buildSessionPrompt(context());
    expect(prompt).toContain("Upper Strength (Pull)");
    expect(prompt).toContain("Upper Strength session");
    expect(prompt).toContain("Session emphasis: Pull-dominant.");
  });

  it("lists candidates with ids, prescriptions, history and cautions", () => {
    const prompt = buildSessionPrompt(context());
    expect(prompt).toContain("pull_up — Pull-Up");
    expect(prompt).toContain("usual 3-5×5-10");
    expect(prompt).toContain("[last time: 2026-07-27: 8, 8, 7]");
    expect(prompt).toContain("[caution: Mild wrist pain");
  });

  it("forbids inventing exercises", () => {
    const prompt = buildSessionPrompt(context());
    expect(prompt).toMatch(/never invent an exercise/i);
    expect(prompt).toMatch(/id that is not listed/i);
  });

  it("marks optional sections and omits sections with no candidates", () => {
    const prompt = buildSessionPrompt(context());
    expect(prompt).toContain("Conditioning (choose 1, optional");
    expect(prompt).not.toContain("Empty (choose");
  });

  it("states readiness plainly when nothing is flagged", () => {
    const prompt = buildSessionPrompt(context({ readinessReasons: [] }));
    expect(prompt).toContain("Today's readiness: normal");
  });

  it("omits empty context blocks", () => {
    const prompt = buildSessionPrompt(
      context({ memories: [], openPain: [], recentSessions: [] }),
    );
    expect(prompt).not.toContain("What we know about them");
    expect(prompt).not.toContain("Currently flagged pain");
    expect(prompt).not.toContain("Recent training");
  });
});
