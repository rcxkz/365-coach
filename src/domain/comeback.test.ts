import { describe, expect, it } from "vitest";
import {
  assessReturn,
  daysBetween,
  easedLoad,
  returnRationale,
  type Pause,
} from "./comeback";

const today = "2026-10-23";

describe("assessReturn", () => {
  it("is normal with no history — a first start, not a return", () => {
    expect(assessReturn({ today, trainedDates: [], pauses: [] })).toEqual({
      kind: "normal",
    });
  });

  it("is normal while training steadily", () => {
    expect(
      assessReturn({
        today,
        trainedDates: ["2026-10-21", "2026-10-19", "2026-10-16"],
        pauses: [],
      }),
    ).toEqual({ kind: "normal" });
  });

  it("pauses while a pause is open", () => {
    const pauses: Pause[] = [
      { reason: "unwell", startedOn: "2026-10-20", endedOn: null },
    ];
    expect(
      assessReturn({ today, trainedDates: ["2026-10-19"], pauses }),
    ).toEqual({ kind: "paused", reason: "unwell", since: "2026-10-20" });
  });

  it("starts a ramp after a long gap since the last session", () => {
    const state = assessReturn({
      today,
      trainedDates: ["2026-08-01", "2026-07-30"],
      pauses: [],
    });
    expect(state).toMatchObject({
      kind: "returning",
      cause: "gap",
      daysAway: 83,
      session: 1,
      loadFactor: 0.65,
      maxSets: 2,
    });
  });

  it("climbs back across the ramp and ends after three sessions", () => {
    const before = ["2026-09-01"];
    const second = assessReturn({
      today,
      trainedDates: [...before, "2026-10-20"],
      pauses: [],
    });
    expect(second).toMatchObject({ kind: "returning", session: 2, maxSets: 3 });
    if (second.kind === "returning") {
      expect(second.loadFactor).toBeGreaterThan(0.65);
      expect(second.loadFactor).toBeLessThan(1);
    }

    expect(
      assessReturn({
        today,
        trainedDates: [...before, "2026-10-16", "2026-10-18", "2026-10-20"],
        pauses: [],
      }),
    ).toEqual({ kind: "normal" });
  });

  it("eases in after being unwell even when the gap was short", () => {
    const state = assessReturn({
      today,
      trainedDates: ["2026-10-17"],
      pauses: [{ reason: "unwell", startedOn: "2026-10-18", endedOn: "2026-10-22" }],
    });
    expect(state).toMatchObject({
      kind: "returning",
      cause: "unwell",
      daysAway: 5,
      session: 1,
      loadFactor: 0.8,
    });
  });

  it("a short break that wasn't illness doesn't trigger a ramp", () => {
    expect(
      assessReturn({
        today,
        trainedDates: ["2026-10-17"],
        pauses: [{ reason: "break", startedOn: "2026-10-18", endedOn: "2026-10-20" }],
      }),
    ).toEqual({ kind: "normal" });
  });

  it("an old gap already ramped through doesn't come back", () => {
    expect(
      assessReturn({
        today,
        trainedDates: [
          "2026-07-01",
          "2026-10-10",
          "2026-10-14",
          "2026-10-18",
        ],
        pauses: [],
      }),
    ).toEqual({ kind: "normal" });
  });

  it("ignores trained dates from today onwards", () => {
    expect(
      assessReturn({ today, trainedDates: ["2026-08-01", today], pauses: [] }),
    ).toMatchObject({ kind: "returning", session: 1 });
  });
});

describe("helpers", () => {
  it("counts days between ISO dates", () => {
    expect(daysBetween("2026-10-01", "2026-10-23")).toBe(22);
  });

  it("rounds eased loads down", () => {
    expect(easedLoad(16, 0.65)).toBe(10);
    expect(easedLoad(14, 0.85)).toBe(11);
  });

  it("explains the first session back without guilt", () => {
    const text = returnRationale({
      kind: "returning",
      cause: "unwell",
      daysAway: 30,
      session: 1,
      loadFactor: 0.65,
      maxSets: 2,
    });
    expect(text).toMatch(/First session back after being unwell/);
    expect(text).not.toMatch(/missed|behind|catch up/i);
  });
});
