import { describe, expect, it } from "vitest";
import { filterCandidates } from "./candidates";
import type { ExerciseDefinition } from "./exercises";
import type { TemplateSection } from "./templates";

function exercise(overrides: Partial<ExerciseDefinition>): ExerciseDefinition {
  return {
    id: "test_exercise",
    name: "Test Exercise",
    category: "strength",
    movementPattern: "vertical_pull",
    bodyRegion: "upper",
    equipment: ["pull_up_bar"],
    goals: ["general_strength"],
    difficulty: 2,
    riskLevel: 2,
    recoveryCost: 2,
    setsMin: 3,
    setsMax: 4,
    repsTarget: "6-10",
    restSeconds: 120,
    placements: ["primary"],
    cues: "Test cue.",
    ...overrides,
  };
}

const SECTION: TemplateSection = {
  role: "Primary Pull",
  placements: ["primary"],
  patterns: ["vertical_pull", "horizontal_pull"],
  count: 1,
};

const CALM = { painFlags: [], readiness: "green" as const };

describe("filterCandidates", () => {
  it("gates on placement, pattern, category, region and recovery cost", () => {
    const pool = [
      exercise({ id: "fits" }),
      exercise({ id: "wrong_placement", placements: ["accessory"] }),
      exercise({ id: "wrong_pattern", movementPattern: "squat" }),
    ];
    const ids = filterCandidates(pool, SECTION, CALM).map(
      (c) => c.exercise.id,
    );
    expect(ids).toEqual(["fits"]);

    const narrow: TemplateSection = {
      role: "Gentle Mobility",
      placements: ["cooldown"],
      categories: ["mobility"],
      bodyRegions: ["lower"],
      maxRecoveryCost: 1,
      count: 1,
    };
    const mobilityPool = [
      exercise({
        id: "gentle",
        category: "mobility",
        movementPattern: "mobility",
        bodyRegion: "lower",
        placements: ["cooldown"],
        recoveryCost: 1,
      }),
      exercise({
        id: "too_costly",
        category: "mobility",
        movementPattern: "mobility",
        bodyRegion: "lower",
        placements: ["cooldown"],
        recoveryCost: 3,
      }),
      exercise({
        id: "wrong_region",
        category: "mobility",
        movementPattern: "mobility",
        bodyRegion: "upper",
        placements: ["cooldown"],
        recoveryCost: 1,
      }),
    ];
    expect(
      filterCandidates(mobilityPool, narrow, CALM).map((c) => c.exercise.id),
    ).toEqual(["gentle"]);
  });

  it("excludes exercises whose equipment is unavailable", () => {
    const pool = [
      exercise({ id: "bar_only", equipment: ["pull_up_bar"] }),
      exercise({ id: "needs_belt", equipment: ["pull_up_bar", "dip_belt"] }),
    ];
    const ids = filterCandidates(pool, SECTION, {
      ...CALM,
      availableEquipment: ["pull_up_bar"],
    }).map((c) => c.exercise.id);
    expect(ids).toEqual(["bar_only"]);
  });

  it("hard-excludes avoid-area matches at severity 3+, cautions below", () => {
    const pool = [
      exercise({ id: "loads_shoulder", avoidAreas: ["shoulder"] }),
      exercise({ id: "shoulder_free" }),
    ];

    const moderate = filterCandidates(pool, SECTION, {
      painFlags: [{ location: "shoulder", severity: 3 }],
      readiness: "green",
    });
    expect(moderate.map((c) => c.exercise.id)).toEqual(["shoulder_free"]);

    const mild = filterCandidates(pool, SECTION, {
      painFlags: [{ location: "shoulder", severity: 2 }],
      readiness: "green",
    });
    expect(mild.map((c) => c.exercise.id)).toEqual([
      "loads_shoulder",
      "shoulder_free",
    ]);
    expect(mild[0].cautions[0]).toMatch(/Mild shoulder pain/);
  });

  it("keeps caution-area matches with a severity-appropriate note", () => {
    const pool = [exercise({ id: "wristy", cautionAreas: ["wrist"] })];
    const result = filterCandidates(pool, SECTION, {
      painFlags: [{ location: "wrist", severity: 3 }],
      readiness: "green",
    });
    expect(result.length).toBe(1);
    expect(result[0].cautions[0]).toMatch(/Moderate wrist pain/);
  });

  it("tightens the risk allowance as readiness drops", () => {
    const pool = [
      exercise({ id: "risky", riskLevel: 4 }),
      exercise({ id: "moderate", riskLevel: 3 }),
      exercise({ id: "safe", riskLevel: 1 }),
    ];
    expect(
      filterCandidates(pool, SECTION, CALM).map((c) => c.exercise.id),
    ).toEqual(["risky", "moderate", "safe"]);
    expect(
      filterCandidates(pool, SECTION, { ...CALM, readiness: "yellow" }).map(
        (c) => c.exercise.id,
      ),
    ).toEqual(["moderate", "safe"]);
    expect(
      filterCandidates(pool, SECTION, { ...CALM, readiness: "red" }).map(
        (c) => c.exercise.id,
      ),
    ).toEqual(["safe"]);
  });
});

describe("filterCandidates — ruled out", () => {
  it("never offers an exercise the user said is not for them", () => {
    const pool = [exercise({ id: "kept" }), exercise({ id: "not_for_me" })];
    const ids = filterCandidates(pool, SECTION, {
      ...CALM,
      excludedExerciseIds: ["not_for_me"],
    }).map((c) => c.exercise.id);
    expect(ids).toEqual(["kept"]);
  });
});

describe("filterCandidates — protected areas", () => {
  it("cautions exercises that load a protected area without excluding them", () => {
    const pool = [exercise({ id: "loads_wrist", cautionAreas: ["wrist"] }), exercise({ id: "fine" })];
    const result = filterCandidates(pool, SECTION, { ...CALM, protectAreas: ["wrist"] });
    expect(result.map((c) => c.exercise.id)).toEqual(["loads_wrist", "fine"]);
    expect(result[0].cautions.join(" ")).toMatch(/Go gently on your wrist/);
    expect(result[1].cautions).toEqual([]);
  });
});
