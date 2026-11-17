import { describe, expect, it } from "vitest";
import { evaluateBlock1 } from "./block1";
import { summariseTrend, type MetricKind, type MetricTrend } from "./metrics";

function trend(
  kind: MetricKind,
  from: number,
  to?: number,
): MetricTrend {
  const points = [{ date: "2026-06-01", value: from }];
  if (to !== undefined) points.push({ date: "2026-07-28", value: to });
  return summariseTrend(kind, points)!;
}

function criterion(id: string, result: ReturnType<typeof evaluateBlock1>) {
  const found = result.criteria.find((c) => c.id === id);
  if (!found) throw new Error(`missing criterion ${id}`);
  return found;
}

describe("evaluateBlock1", () => {
  it("reports everything unknown on a blank slate without blame", () => {
    const result = evaluateBlock1({
      trends: {},
      recentSessions: 0,
      openPain: [],
    });
    // Pain is the one thing an empty state legitimately passes.
    expect(criterion("pain", result).status).toBe("met");
    expect(criterion("mobility", result).status).toBe("unknown");
    expect(result.ready).toBe(false);
    for (const c of result.criteria) {
      expect(c.detail).not.toMatch(/should|behind|fail|missed|only/i);
    }
  });

  it("counts six sessions a fortnight as consistent", () => {
    const met = evaluateBlock1({ trends: {}, recentSessions: 6, openPain: [] });
    expect(criterion("consistency", met).status).toBe("met");
    const building = evaluateBlock1({
      trends: {},
      recentSessions: 3,
      openPain: [],
    });
    expect(criterion("consistency", building).status).toBe("building");
  });

  it("treats open pain as something to work around, not a failure", () => {
    const result = evaluateBlock1({
      trends: {},
      recentSessions: 6,
      openPain: [{ location: "lower_back", severity: 3 }],
    });
    const pain = criterion("pain", result);
    expect(pain.status).toBe("building");
    expect(pain.detail).toMatch(/lower back/);
    expect(pain.detail).toMatch(/adapt/i);
  });

  it("passes mobility on improvement or a high score", () => {
    const improved = evaluateBlock1({
      trends: { mobility_score: trend("mobility_score", 5, 7) },
      recentSessions: 6,
      openPain: [],
    });
    expect(criterion("mobility", improved).status).toBe("met");

    const high = evaluateBlock1({
      trends: { mobility_score: trend("mobility_score", 9, 9) },
      recentSessions: 6,
      openPain: [],
    });
    expect(criterion("mobility", high).status).toBe("met");
  });

  it("needs both pull-ups and dips moving", () => {
    const one = evaluateBlock1({
      trends: { pullup_max: trend("pullup_max", 5, 8) },
      recentSessions: 6,
      openPain: [],
    });
    expect(criterion("upper_strength", one).status).toBe("unknown");

    const both = evaluateBlock1({
      trends: {
        pullup_max: trend("pullup_max", 5, 8),
        dip_max: trend("dip_max", 8, 12),
      },
      recentSessions: 6,
      openPain: [],
    });
    expect(criterion("upper_strength", both).status).toBe("met");

    const stalled = evaluateBlock1({
      trends: {
        pullup_max: trend("pullup_max", 5, 5),
        dip_max: trend("dip_max", 8, 12),
      },
      recentSessions: 6,
      openPain: [],
    });
    expect(criterion("upper_strength", stalled).status).toBe("building");
  });

  it("allows small resting-heart-rate drift as stable", () => {
    const steady = evaluateBlock1({
      trends: { resting_hr: trend("resting_hr", 58, 60) },
      recentSessions: 6,
      openPain: [],
    });
    expect(criterion("recovery", steady).status).toBe("met");

    const climbing = evaluateBlock1({
      trends: { resting_hr: trend("resting_hr", 58, 66) },
      recentSessions: 6,
      openPain: [],
    });
    const recovery = criterion("recovery", climbing);
    expect(recovery.status).toBe("building");
    expect(recovery.detail).toMatch(/sleep or stress/);
  });

  it("is ready only when every criterion is met", () => {
    const result = evaluateBlock1({
      trends: {
        mobility_score: trend("mobility_score", 5, 8),
        pullup_max: trend("pullup_max", 5, 9),
        dip_max: trend("dip_max", 8, 14),
        resting_hr: trend("resting_hr", 60, 57),
        waist: trend("waist", 92, 89),
      },
      recentSessions: 8,
      openPain: [],
    });
    expect(result.metCount).toBe(result.total);
    expect(result.ready).toBe(true);
  });
});
