import { describe, expect, it } from "vitest";
import { addDaysISO, resolveTimeZone, todayInTimeZone } from "./dates";

describe("addDaysISO", () => {
  it("adds a day", () => {
    expect(addDaysISO("2026-07-26", 1)).toBe("2026-07-27");
  });

  it("crosses month and year boundaries", () => {
    expect(addDaysISO("2026-07-31", 1)).toBe("2026-08-01");
    expect(addDaysISO("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("handles multi-day offsets", () => {
    expect(addDaysISO("2026-07-26", -7)).toBe("2026-07-19");
  });
});

describe("todayInTimeZone", () => {
  it("formats a winter date in Europe/London (GMT)", () => {
    const now = new Date("2026-01-01T00:30:00Z");
    expect(todayInTimeZone("Europe/London", now)).toBe("2026-01-01");
  });

  it("rolls over to the next day during BST", () => {
    const now = new Date("2026-06-30T23:30:00Z");
    expect(todayInTimeZone("Europe/London", now)).toBe("2026-07-01");
  });

  it("defaults to Europe/London and returns ISO date shape", () => {
    expect(todayInTimeZone()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("resolveTimeZone", () => {
  it("takes a valid IANA zone and falls back to London otherwise", () => {
    expect(resolveTimeZone("America/New_York")).toBe("America/New_York");
    expect(resolveTimeZone("Mars/Olympus")).toBe("Europe/London");
    expect(resolveTimeZone(undefined)).toBe("Europe/London");
  });
});
