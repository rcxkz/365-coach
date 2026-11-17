import { describe, expect, it } from "vitest";
import { getDayActions } from "./repos/today";
import { getWorkoutByDate } from "./repos/workouts";
import { seedDay } from "./seed";

describe("seedDay", () => {
  it("creates a starter session and the day around it", async () => {
    const created = await seedDay("2026-07-26");
    expect(created).toBe(true);

    const workout = await getWorkoutByDate("2026-07-26");
    expect(workout).not.toBeNull();
    expect(workout!.exercises.length).toBeGreaterThanOrEqual(5);
    expect(workout!.exercises.some((e) => e.inShortVersion)).toBe(true);
    expect(workout!.rationale).toBeTruthy();

    const actions = await getDayActions("2026-07-26");
    expect(actions[0].kind).toBe("workout");
    expect(actions[0].workoutId).toBe(workout!.id);
    expect(actions.filter((a) => a.kind === "project").length).toBeLessThanOrEqual(1);
  });

  it("is idempotent — second run changes nothing", async () => {
    const before = await getDayActions("2026-07-26");
    const created = await seedDay("2026-07-26");
    expect(created).toBe(false);
    const after = await getDayActions("2026-07-26");
    expect(after).toEqual(before);
  });
});
