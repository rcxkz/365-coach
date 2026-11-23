import { beforeAll, describe, expect, it } from "vitest";
import { generateDay } from "./generate-day";
import { saveProfile } from "@/data/repos/profile";
import { getDayActions, setActionStatus } from "@/data/repos/today";
import { endPause, startPause } from "@/data/repos/pauses";
import { createWorkout, getWorkoutByDate, logSet } from "@/data/repos/workouts";
import { syncLibraries } from "@/data/sync";
import { DEFAULT_PROFILE } from "@/domain/profile";

/** Dates well after today, so planning counts as planning ahead. */
describe("re-planning a day", () => {
  beforeAll(async () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    await syncLibraries();
    await saveProfile({
      ...DEFAULT_PROFILE,
      training: { ...DEFAULT_PROFILE.training, daysPerWeek: 3 },
    });
  });

  it("keeps a dinner already ticked as done", async () => {
    const date = "2031-04-01";
    await generateDay(date);
    const dinner = (await getDayActions(date)).find((action) => action.mealId);
    expect(dinner).toBeTruthy();
    await setActionStatus(dinner!.id, "done");

    // "Different session" or "I'm back" in the evening re-plans the day.
    await generateDay(date);
    const after = (await getDayActions(date)).filter((action) => action.domain === "fuel");
    expect(after.find((action) => action.mealId)).toMatchObject({
      mealId: dinner!.mealId,
      status: "done",
    });
  });

  it("counts a session still planned for later this week when planning ahead", async () => {
    // Three days a week: Monday and Wednesday trained, Friday planned.
    const exercises = [{ name: "Goblet squat", targetSets: 3, targetReps: "8" }];
    await createWorkout({ date: "2031-03-03", title: "A", status: "completed", exercises });
    await createWorkout({ date: "2031-03-05", title: "B", status: "completed", exercises });
    await createWorkout({ date: "2031-03-07", title: "C", status: "planned", exercises });

    const saturday = await generateDay("2031-03-08");
    expect(saturday).toMatchObject({ ok: true, mode: "rest_day" });
  });

  it("keeps a session already trained today on Today when pausing", async () => {
    const date = "2031-05-06";
    await generateDay(date);
    const workout = await getWorkoutByDate(date);
    await logSet(workout!.exercises[0].id, { setNumber: 1, reps: 8 });

    await startPause("unwell", date);
    await generateDay(date);
    await endPause(date);

    const actions = await getDayActions(date);
    expect(actions.some((action) => action.kind === "workout")).toBe(true);
  });
});
