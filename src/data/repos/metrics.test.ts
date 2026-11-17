import { describe, expect, it } from "vitest";
import {
  countCompletedWorkoutsSince,
  getLatestMetric,
  getMetricTrends,
  listMetrics,
  recordMetric,
} from "./metrics";
import { createWorkout, setWorkoutStatus } from "./workouts";

describe("metrics repo", () => {
  it("records a reading with the metric's unit", async () => {
    const row = await recordMetric({
      date: "2026-07-01",
      kind: "waist",
      value: 92,
    });
    expect(row.unit).toBe("cm");
    expect(row.value).toBe(92);
  });

  it("corrects rather than duplicates a same-day reading", async () => {
    await recordMetric({ date: "2026-07-02", kind: "waist", value: 91 });
    await recordMetric({ date: "2026-07-02", kind: "waist", value: 90.5 });
    const rows = (await listMetrics("waist")).filter(
      (row) => row.date === "2026-07-02",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe(90.5);
  });

  it("rejects values outside the sane range", async () => {
    await expect(
      recordMetric({ date: "2026-07-03", kind: "resting_hr", value: 400 }),
    ).rejects.toThrow(/usually between/);
  });

  it("builds oldest-first trends per metric", async () => {
    await recordMetric({ date: "2026-07-10", kind: "pullup_max", value: 5 });
    await recordMetric({ date: "2026-07-20", kind: "pullup_max", value: 8 });
    const trends = await getMetricTrends();
    expect(trends.pullup_max?.first.value).toBe(5);
    expect(trends.pullup_max?.latest.value).toBe(8);
    expect(trends.pullup_max?.improving).toBe(true);
  });

  it("keeps the mobility breakdown on the latest reading", async () => {
    await recordMetric({
      date: "2026-07-15",
      kind: "mobility_score",
      value: 6,
      note: "Wrists 1/2, Shoulders 1/2, Thoracic 1/2, Hips 2/2, Ankles 1/2",
    });
    const latest = await getLatestMetric("mobility_score");
    expect(latest?.value).toBe(6);
    expect(latest?.note).toMatch(/Hips 2\/2/);
  });

  it("counts only completed workouts in the window", async () => {
    const done = await createWorkout({
      date: "2026-07-26",
      title: "Done session",
      exercises: [],
    });
    await setWorkoutStatus(done.id, "completed");
    await createWorkout({
      date: "2026-07-27",
      title: "Planned session",
      exercises: [],
    });
    await createWorkout({
      date: "2026-06-01",
      title: "Old session",
      exercises: [],
    }).then((old) => setWorkoutStatus(old.id, "completed"));

    expect(await countCompletedWorkoutsSince("2026-07-20")).toBe(1);
  });
});
