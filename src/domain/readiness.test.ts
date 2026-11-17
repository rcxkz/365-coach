import { describe, expect, it } from "vitest";
import { assessReadiness } from "./readiness";

describe("assessReadiness", () => {
  it("is green with a normal check-in and no pain", () => {
    const result = assessReadiness(
      { sleep: "normal", energy: "normal", soreness: "none" },
      [],
    );
    expect(result.level).toBe("green");
    expect(result.reasons).toEqual([]);
  });

  it("assumes normal readiness when no check-in exists (doc 12 failure behaviour)", () => {
    expect(assessReadiness(null, []).level).toBe("green");
  });

  it("still counts pain flags when the check-in is missing", () => {
    const result = assessReadiness(null, [
      { location: "shoulder", severity: 4 },
    ]);
    expect(result.level).toBe("red");
  });

  it("goes red on severe pain", () => {
    const result = assessReadiness(
      { sleep: "good", energy: "high", soreness: "none" },
      [{ location: "lower_back", severity: 4 }],
    );
    expect(result.level).toBe("red");
    expect(result.reasons[0]).toMatch(/lower back/);
    expect(result.reasons[0]).toMatch(/looked at/);
  });

  it("goes red when poor sleep and low energy combine", () => {
    const result = assessReadiness(
      { sleep: "poor", energy: "low", soreness: "none" },
      [],
    );
    expect(result.level).toBe("red");
  });

  it("goes yellow on any single flag", () => {
    expect(
      assessReadiness({ sleep: "poor", energy: "normal", soreness: "none" }, [])
        .level,
    ).toBe("yellow");
    expect(
      assessReadiness({ sleep: "normal", energy: "low", soreness: "none" }, [])
        .level,
    ).toBe("yellow");
    expect(
      assessReadiness(
        { sleep: "normal", energy: "normal", soreness: "heavy" },
        [],
      ).level,
    ).toBe("yellow");
    expect(
      assessReadiness({ sleep: "normal", energy: "normal", soreness: "none" }, [
        { location: "knee", severity: 3 },
      ]).level,
    ).toBe("yellow");
  });

  it("ignores mild pain and mild soreness for the level", () => {
    const result = assessReadiness(
      { sleep: "normal", energy: "normal", soreness: "mild" },
      [{ location: "wrist", severity: 2 }],
    );
    expect(result.level).toBe("green");
    expect(result.reasons).toEqual([]);
  });

  it("red wins over later yellow factors and keeps all reasons", () => {
    const result = assessReadiness(
      { sleep: "poor", energy: "low", soreness: "heavy" },
      [{ location: "ankle", severity: 3 }],
    );
    expect(result.level).toBe("red");
    expect(result.reasons.length).toBe(3);
  });

  it("collects multiple yellow reasons without escalating to red", () => {
    const result = assessReadiness(
      { sleep: "poor", energy: "normal", soreness: "heavy" },
      [],
    );
    expect(result.level).toBe("yellow");
    expect(result.reasons.length).toBe(2);
  });
});

describe("assessReadiness — journal", () => {
  it("high stress makes it a lighter day", () => {
    const result = assessReadiness(null, [], { stress: "high" });
    expect(result.level).toBe("yellow");
    expect(result.reasons.join(" ")).toMatch(/Stress/);
  });

  it("low energy in the journal counts like low energy at check-in", () => {
    expect(assessReadiness({ sleep: "poor" }, [], { energy: "low" }).level).toBe("red");
  });

  it("low mood alone changes nothing", () => {
    expect(assessReadiness(null, [], {}).level).toBe("green");
  });
});
