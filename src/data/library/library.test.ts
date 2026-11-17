import { describe, expect, it } from "vitest";
import { EXERCISE_LIBRARY } from "./index";

/**
 * Referential and structural integrity of the curated library. These
 * rules are what let selection logic trust the data blindly.
 */
describe("exercise library", () => {
  const byId = new Map(EXERCISE_LIBRARY.map((e) => [e.id, e]));

  it("has unique ids", () => {
    expect(byId.size).toBe(EXERCISE_LIBRARY.length);
  });

  it("covers every category with a sensible minimum", () => {
    const counts = new Map<string, number>();
    for (const e of EXERCISE_LIBRARY) {
      counts.set(e.category, (counts.get(e.category) ?? 0) + 1);
    }
    expect(counts.get("strength") ?? 0).toBeGreaterThanOrEqual(20);
    expect(counts.get("calisthenics") ?? 0).toBeGreaterThanOrEqual(18);
    expect(counts.get("athleticism") ?? 0).toBeGreaterThanOrEqual(8);
    expect(counts.get("conditioning") ?? 0).toBeGreaterThanOrEqual(8);
    expect(counts.get("mobility") ?? 0).toBeGreaterThanOrEqual(15);
    expect(counts.get("restoration") ?? 0).toBeGreaterThanOrEqual(3);
    expect(counts.get("prehab") ?? 0).toBeGreaterThanOrEqual(8);
  });

  it("only references exercises that exist", () => {
    const dangling: string[] = [];
    for (const e of EXERCISE_LIBRARY) {
      for (const ref of [
        ...(e.progressions ?? []),
        ...(e.regressions ?? []),
        ...(e.substitutions ?? []),
      ]) {
        if (!byId.has(ref)) dangling.push(`${e.id} -> ${ref}`);
      }
    }
    expect(dangling).toEqual([]);
  });

  it("orders difficulty across progressions and regressions", () => {
    const violations: string[] = [];
    for (const e of EXERCISE_LIBRARY) {
      for (const id of e.progressions ?? []) {
        const target = byId.get(id);
        if (target && target.difficulty < e.difficulty) {
          violations.push(`${e.id} progression ${id} is easier`);
        }
      }
      for (const id of e.regressions ?? []) {
        const target = byId.get(id);
        if (target && target.difficulty > e.difficulty) {
          violations.push(`${e.id} regression ${id} is harder`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("keeps scales in range and fields coherent", () => {
    for (const e of EXERCISE_LIBRARY) {
      expect(e.difficulty, e.id).toBeGreaterThanOrEqual(1);
      expect(e.difficulty, e.id).toBeLessThanOrEqual(5);
      expect(e.riskLevel, e.id).toBeGreaterThanOrEqual(1);
      expect(e.riskLevel, e.id).toBeLessThanOrEqual(5);
      expect(e.recoveryCost, e.id).toBeGreaterThanOrEqual(1);
      expect(e.recoveryCost, e.id).toBeLessThanOrEqual(5);
      expect(e.setsMin, e.id).toBeGreaterThanOrEqual(1);
      expect(e.setsMax, e.id).toBeGreaterThanOrEqual(e.setsMin);
      expect(e.placements.length, e.id).toBeGreaterThan(0);
      expect(e.equipment.length, e.id).toBeGreaterThan(0);
      expect(e.goals.length, e.id).toBeGreaterThan(0);
      expect(e.cues.length, e.id).toBeGreaterThan(0);
      expect(e.repsTarget.length, e.id).toBeGreaterThan(0);
    }
  });

  it("gives every higher-risk exercise an easier alternative (doc 15 principle)", () => {
    const missing: string[] = [];
    for (const e of EXERCISE_LIBRARY) {
      if (e.riskLevel >= 3) {
        const alternatives = [
          ...(e.regressions ?? []),
          ...(e.substitutions ?? []),
        ];
        if (alternatives.length === 0) missing.push(e.id);
      }
    }
    expect(missing).toEqual([]);
  });
});
