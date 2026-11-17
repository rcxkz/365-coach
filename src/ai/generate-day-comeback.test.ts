import { beforeAll, describe, expect, it } from "vitest";
import { generateDay } from "./generate-day";
import { EXERCISE_LIBRARY } from "@/data/library";
import { upsertExercises } from "@/data/repos/exercises";
import { endPause, startPause } from "@/data/repos/pauses";
import { getDayActions } from "@/data/repos/today";
import {
  getWorkoutByDate,
  logSet,
  setWorkoutStatus,
} from "@/data/repos/workouts";

/**
 * Phase 8, end to end without AI: a paused day plans no training, and
 * the sessions after a long gap come back lighter and say why.
 */
describe("generateDay — coming back", () => {
  beforeAll(async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await upsertExercises(EXERCISE_LIBRARY);
  });

  it("plans no training while paused, and no project step when unwell", async () => {
    await startPause("unwell", "2026-09-01");
    const result = await generateDay("2026-09-02");
    expect(result).toEqual({ ok: true, title: "Rest", mode: "paused" });
    expect(await getWorkoutByDate("2026-09-02")).toBeNull();
    const kinds = (await getDayActions("2026-09-02")).map((a) => a.kind);
    expect(kinds).not.toContain("workout");
    expect(kinds).not.toContain("project");
    await endPause("2026-09-03");
  });

  it("eases the first session back in after being unwell", async () => {
    // A trained day well before the illness, at a known load.
    const before = await generateDay("2026-08-20");
    expect(before.ok).toBe(true);
    const trained = await getWorkoutByDate("2026-08-20");
    for (const exercise of trained!.exercises) {
      await logSet(exercise.id, { setNumber: 1, reps: 8, weightKg: 20 });
    }
    await setWorkoutStatus(trained!.id, "completed");

    const result = await generateDay("2026-09-04");
    expect(result.ok).toBe(true);
    const workout = await getWorkoutByDate("2026-09-04");
    expect(workout!.returnSession).toBe(1);
    expect(workout!.rationale).toMatch(/First session back/);
    for (const exercise of workout!.exercises) {
      expect(exercise.targetSets).toBeLessThanOrEqual(2);
      if (exercise.targetWeightKg != null) {
        expect(exercise.targetWeightKg).toBeLessThan(20);
      }
    }
  });
});
