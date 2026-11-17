import { describe, expect, it } from "vitest";
import { hourInTimeZone, morningReminder } from "./reminders";

const workout = {
  title: "Lower Strength",
  durationMinutes: 45,
  returnSession: null,
  status: "planned" as const,
};

describe("hourInTimeZone", () => {
  it("follows London through the clock change", () => {
    // 06:15 UTC is 07:15 in British Summer Time, 06:15 in GMT.
    expect(hourInTimeZone(new Date("2026-07-01T06:15:00Z"))).toBe(7);
    expect(hourInTimeZone(new Date("2026-12-01T06:15:00Z"))).toBe(6);
    expect(hourInTimeZone(new Date("2026-12-01T07:15:00Z"))).toBe(7);
  });
});

describe("morningReminder", () => {
  it("names the session and the rest of the day", () => {
    expect(morningReminder({ paused: false, workout, otherActions: 2 })).toEqual({
      title: "Today: Lower Strength · ~45 min",
      body: "A tap on how you're feeling tunes it before you go. 2 other things on today's list.",
    });
  });

  it("says nothing while paused, with nothing planned, or once it's done", () => {
    expect(morningReminder({ paused: true, workout, otherActions: 1 })).toBeNull();
    expect(morningReminder({ paused: false, workout: null, otherActions: 3 })).toBeNull();
    expect(
      morningReminder({
        paused: false,
        workout: { ...workout, status: "completed" },
        otherActions: 0,
      }),
    ).toBeNull();
  });

  it("frames the first session back warmly, with no mention of time missed", () => {
    const message = morningReminder({
      paused: false,
      workout: { ...workout, returnSession: 1 },
      otherActions: 0,
    });
    expect(message?.body).toMatch(/First session back/);
    expect(message?.body).not.toMatch(/missed|behind|days/i);
  });
});
