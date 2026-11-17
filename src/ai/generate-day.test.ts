import { beforeAll, describe, expect, it } from "vitest";
import { generateDay } from "./generate-day";
import { EXERCISE_LIBRARY } from "@/data/library";
import { upsertOpenPainFlag, resolvePainFlag, listOpenPainFlags } from "@/data/repos/pain";
import { upsertExercises } from "@/data/repos/exercises";
import { getDayActions } from "@/data/repos/today";
import { getWorkoutByDate } from "@/data/repos/workouts";

/**
 * With no AI credential in the environment, generateDay must still
 * plan a complete day from the rotation (doc 12 failure behaviour) —
 * this is the "the morning is never empty" guarantee, end to end.
 */
describe("generateDay without AI", () => {
  beforeAll(async () => {
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    delete process.env.ANTHROPIC_API_KEY;
    await upsertExercises(EXERCISE_LIBRARY);
  });

  it("plans the first rotation session with linked library exercises", async () => {
    const result = await generateDay("2026-07-27");
    expect(result).toEqual({
      ok: true,
      title: "Upper Strength (Pull)",
      mode: "fallback",
      fallbackReason: "not_configured",
    });

    const workout = await getWorkoutByDate("2026-07-27");
    expect(workout).not.toBeNull();
    expect(workout!.rotationKey).toBe("A");
    expect(workout!.templateId).toBe("upper_strength");
    expect(workout!.exercises.length).toBeGreaterThanOrEqual(6);
    for (const exercise of workout!.exercises) {
      expect(exercise.libraryExerciseId).not.toBeNull();
      expect(exercise.targetSets).toBeGreaterThan(0);
    }
    // A shortened variant must exist (doc 02).
    expect(workout!.exercises.some((e) => e.inShortVersion)).toBe(true);
  });

  it("advances the rotation on the next day", async () => {
    const result = await generateDay("2026-07-28");
    expect(result.ok && result.title).toBe("Lower Strength");
    const workout = await getWorkoutByDate("2026-07-28");
    expect(workout!.rotationKey).toBe("B");
  });

  it("plans recovery on a red day and respects pain gates", async () => {
    const flag = await upsertOpenPainFlag({
      location: "lower_back",
      severity: 4,
    });
    try {
      const result = await generateDay("2026-07-29");
      expect(result.ok && result.title).toBe("Recovery + Mobility + Zone 2");

      const workout = await getWorkoutByDate("2026-07-29");
      expect(workout!.templateId).toBe("recovery");
      const byId = new Map(EXERCISE_LIBRARY.map((e) => [e.id, e]));
      for (const exercise of workout!.exercises) {
        const def = byId.get(exercise.libraryExerciseId!);
        expect(def?.avoidAreas ?? []).not.toContain("lower_back");
      }
    } finally {
      await resolvePainFlag(flag.id);
      expect(await listOpenPainFlags()).toHaveLength(0);
    }
  });

  it("re-planning a day replaces it without advancing the rotation", async () => {
    const again = await generateDay("2026-07-27");
    expect(again.ok && again.title).toBe("Upper Strength (Pull)");
    const workout = await getWorkoutByDate("2026-07-27");
    // The day's own key must not count as history against itself.
    expect(workout!.rotationKey).toBe("A");
  });

  /**
   * The 31 July failure: a workout was written and the day's actions
   * never were, so Today was blank while a session sat behind it. A
   * planned day must always have something to open.
   */
  it("never leaves a workout without a day around it", async () => {
    for (const date of ["2026-07-27", "2026-07-28", "2026-07-29"]) {
      const workout = await getWorkoutByDate(date);
      expect(workout).not.toBeNull();

      const actions = await getDayActions(date);
      expect(actions.length).toBeGreaterThan(0);

      const opensTheSession = actions.some(
        (action) => action.workoutId === workout!.id,
      );
      expect(opensTheSession).toBe(true);
    }
  });

  it("writes the session action before anything slower can fail", async () => {
    await generateDay("2026-08-02");
    const [first] = await getDayActions("2026-08-02");
    // Food and project actions come from further model calls; the
    // session has to be first so a failure there still leaves a day.
    expect(first.kind).toBe("workout");
  });
});
