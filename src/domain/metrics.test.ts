import { describe, expect, it } from "vitest";
import {
  isMetricKind,
  MOBILITY_MAX_SCORE,
  MOBILITY_TESTS,
  scoreMobility,
  summariseTrend,
  validateMetric,
} from "./metrics";

describe("metric validation", () => {
  it("accepts plausible values", () => {
    expect(validateMetric("body_weight", 82.4)).toBeNull();
    expect(validateMetric("pullup_max", 9)).toBeNull();
  });

  it("catches a slipped decimal", () => {
    expect(validateMetric("body_weight", 824)).toMatch(/usually between/);
    expect(validateMetric("resting_hr", 4)).toMatch(/usually between/);
  });

  it("rejects non-numbers", () => {
    expect(validateMetric("waist", Number.NaN)).toMatch(/number/);
  });

  it("recognises known kinds only", () => {
    expect(isMetricKind("waist")).toBe(true);
    expect(isMetricKind("vibes")).toBe(false);
  });
});

describe("summariseTrend", () => {
  it("returns null with no readings", () => {
    expect(summariseTrend("waist", [])).toBeNull();
  });

  it("marks a single reading as a baseline", () => {
    const trend = summariseTrend("waist", [{ date: "2026-07-01", value: 92 }]);
    expect(trend).toMatchObject({ change: null, improving: null });
  });

  it("treats a falling waist as improvement", () => {
    const trend = summariseTrend("waist", [
      { date: "2026-07-01", value: 92 },
      { date: "2026-07-28", value: 90.5 },
    ]);
    expect(trend?.change).toBe(-1.5);
    expect(trend?.improving).toBe(true);
  });

  it("treats rising pull-ups as improvement", () => {
    const trend = summariseTrend("pullup_max", [
      { date: "2026-07-01", value: 5 },
      { date: "2026-07-28", value: 8 },
    ]);
    expect(trend?.improving).toBe(true);
  });

  it("never judges body weight", () => {
    const up = summariseTrend("body_weight", [
      { date: "2026-07-01", value: 80 },
      { date: "2026-07-28", value: 82 },
    ]);
    expect(up?.change).toBe(2);
    expect(up?.improving).toBeNull();
  });

  it("reports no change as neither better nor worse", () => {
    const flat = summariseTrend("resting_hr", [
      { date: "2026-07-01", value: 60 },
      { date: "2026-07-28", value: 60 },
    ]);
    expect(flat?.improving).toBeNull();
  });
});

describe("scoreMobility", () => {
  it("totals the five tests out of ten", () => {
    const perfect = Object.fromEntries(
      MOBILITY_TESTS.map((test) => [test.id, 2]),
    );
    const { total, breakdown } = scoreMobility(perfect);
    expect(total).toBe(MOBILITY_MAX_SCORE);
    expect(breakdown).toContain("Wrists 2/2");
  });

  it("clamps out-of-range scores and treats missing as zero", () => {
    const { total } = scoreMobility({ wrists: 9, shoulders: -3 });
    expect(total).toBe(2);
  });

  it("records a breakdown for every area", () => {
    const { breakdown } = scoreMobility({});
    for (const test of MOBILITY_TESTS) {
      expect(breakdown).toContain(test.area);
    }
  });
});
