import { describe, expect, it } from "vitest";
import { EXERCISE_LIBRARY } from "../library";
import {
  getExercisesByIds,
  getExerciseUserStates,
  listExercises,
  upsertExercises,
  upsertExerciseUserState,
} from "./exercises";

describe("exercises repo", () => {
  it("seeds the full library and is idempotent", async () => {
    await upsertExercises(EXERCISE_LIBRARY);
    const first = await listExercises();
    expect(first.length).toBe(EXERCISE_LIBRARY.length);

    // Re-running must not duplicate and must apply edits in place.
    await upsertExercises(EXERCISE_LIBRARY);
    const second = await listExercises();
    expect(second.length).toBe(EXERCISE_LIBRARY.length);
  });

  it("applies library edits on re-upsert", async () => {
    const original = EXERCISE_LIBRARY.find((e) => e.id === "pull_up");
    if (!original) throw new Error("pull_up missing from library");

    await upsertExercises([{ ...original, cues: "Edited cue." }]);
    const [edited] = await getExercisesByIds(["pull_up"]);
    expect(edited.cues).toBe("Edited cue.");

    await upsertExercises([original]);
    const [restored] = await getExercisesByIds(["pull_up"]);
    expect(restored.cues).toBe(original.cues);
  });

  it("round-trips arrays and enums faithfully", async () => {
    const [row] = await getExercisesByIds(["weighted_pull_up"]);
    expect(row.category).toBe("strength");
    expect(row.movementPattern).toBe("vertical_pull");
    expect(row.avoidAreas).toEqual(["shoulder", "elbow"]);
    expect(row.regressions).toContain("pull_up");
  });

  it("rejects vocabulary violations", async () => {
    const bad = {
      ...EXERCISE_LIBRARY[0],
      id: "bad_exercise",
      equipment: ["anti_gravity_chamber"],
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(upsertExercises([bad as any])).rejects.toThrow(
      /invalid equipment/,
    );
  });

  it("stores and updates per-exercise user state", async () => {
    const created = await upsertExerciseUserState({
      exerciseId: "pull_up",
      preference: 2,
    });
    expect(created.preference).toBe(2);

    const updated = await upsertExerciseUserState({
      exerciseId: "pull_up",
      note: "Grip feels best slightly wider than shoulders.",
    });
    expect(updated.preference).toBe(2);
    expect(updated.note).toMatch(/wider/);

    const states = await getExerciseUserStates(["pull_up"]);
    expect(states.length).toBe(1);
  });

  it("rejects out-of-range preference", async () => {
    await expect(
      upsertExerciseUserState({ exerciseId: "pull_up", preference: 3 }),
    ).rejects.toThrow(/out of range/);
  });
});
