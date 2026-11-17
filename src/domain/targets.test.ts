import { describe, expect, it } from "vitest";
import { defaultRepsFor, measureFor } from "./targets";

describe("defaultRepsFor", () => {
  it("takes the top of a range", () => {
    expect(defaultRepsFor("6-8")).toBe(8);
    expect(defaultRepsFor("8-10")).toBe(10);
  });

  it("takes a plain number", () => {
    expect(defaultRepsFor("10")).toBe(10);
  });

  it("takes the number from descriptive targets", () => {
    expect(defaultRepsFor("8 per side")).toBe(8);
    expect(defaultRepsFor("30m")).toBe(30);
  });

  it("falls back to 1 when no number is present", () => {
    expect(defaultRepsFor("to comfortable effort")).toBe(1);
  });
});

describe("defaultRepsFor — leading quantity only", () => {
  it("ignores trailing detail", () => {
    expect(defaultRepsFor("40-60m at 80-90%")).toBe(60);
    expect(defaultRepsFor("4-6 x 3-5s lowering")).toBe(6);
    expect(defaultRepsFor("250m hard / 90s easy")).toBe(250);
    expect(defaultRepsFor("4-4-4-4 x 10 cycles")).toBe(10);
  });
});

describe("measureFor", () => {
  it.each([
    ["8-12", "reps", "10 reps"],
    ["8-10 per side", "reps", "10 reps"],
    ["20-45s", "seconds", "10s"],
    ["45-60s per side", "seconds", "10s"],
    ["30m per side", "metres", "10m"],
    ["15-20m", "metres", "10m"],
    ["8-12 min", "minutes", "10 min"],
    ["25-45 min, conversational pace", "minutes", "10 min"],
    ["4-6 x 3-5s lowering", "reps", "10 reps"],
    ["5-6 slow", "reps", "10 reps"],
  ])("%s is counted in %s", (target, unit, ten) => {
    const measure = measureFor(target);
    expect(measure.unit).toBe(unit);
    expect(measure.format(10)).toBe(ten);
  });
});
