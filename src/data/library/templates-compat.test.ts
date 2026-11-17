import { describe, expect, it } from "vitest";
import { EXERCISE_LIBRARY } from "./index";
import { buildSessionCandidates } from "../../domain/candidates";
import { readinessAllows, SESSION_TEMPLATES } from "../../domain/templates";

/**
 * Cross-layer guarantee: every template section is satisfiable by the
 * curated library. This is what makes "the AI can only pick from
 * candidates" safe — a section that can't be filled is a data bug, and
 * it fails here, not at generation time.
 */
describe("templates ↔ library compatibility", () => {
  it("fills every section with ≥2 choices under ideal conditions", () => {
    const gaps: string[] = [];
    for (const template of SESSION_TEMPLATES) {
      const sections = buildSessionCandidates(template, EXERCISE_LIBRARY, {
        painFlags: [],
        readiness: "green",
      });
      for (const { section, candidates } of sections) {
        if (candidates.length < 2) {
          gaps.push(`${template.id} / ${section.role} (${candidates.length})`);
        }
      }
    }
    expect(gaps).toEqual([]);
  });

  it("keeps every required section fillable at the template's minimum readiness", () => {
    const gaps: string[] = [];
    for (const template of SESSION_TEMPLATES) {
      for (const level of ["green", "yellow", "red"] as const) {
        if (!readinessAllows(level, template.minReadiness)) continue;
        const sections = buildSessionCandidates(template, EXERCISE_LIBRARY, {
          painFlags: [],
          readiness: level,
        });
        for (const { section, candidates } of sections) {
          if (!section.optional && candidates.length === 0) {
            gaps.push(`${template.id} / ${section.role} @ ${level}`);
          }
        }
      }
    }
    expect(gaps).toEqual([]);
  });

  it("survives moderate shoulder pain: pressing still has shoulder-friendly options", () => {
    const upper = SESSION_TEMPLATES.find((t) => t.id === "upper_strength");
    if (!upper) throw new Error("upper_strength template missing");
    const sections = buildSessionCandidates(upper, EXERCISE_LIBRARY, {
      painFlags: [{ location: "shoulder", severity: 3 }],
      readiness: "green",
    });
    const primaryPush = sections.find(
      (s) => s.section.role === "Primary Push",
    );
    const ids = primaryPush?.candidates.map((c) => c.exercise.id) ?? [];
    // Shoulder avoidArea movements are gone; caution-area ones remain.
    expect(ids).not.toContain("overhead_press");
    expect(ids).not.toContain("barbell_bench_press");
    expect(ids).toContain("machine_chest_press");
    const machine = primaryPush?.candidates.find(
      (c) => c.exercise.id === "machine_chest_press",
    );
    expect(machine?.cautions[0]).toMatch(/shoulder/);
  });
});
