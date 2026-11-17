import { describe, expect, it } from "vitest";
import { writeRulesNarrative } from "./generate-review";
import type { WeekSummary } from "@/domain/week-review";

const base: WeekSummary = {
  weekStart: "2026-11-09",
  weekEnd: "2026-11-15",
  sessionsCompleted: 4,
  setsLogged: 72,
  previousWeekSessions: 3,
  wins: [],
  progressions: [],
  watchouts: [],
};
const call = (name: string, c: "progress" | "hold") => ({ libraryExerciseId: name, name, call: c, reason: "" });

describe("writeRulesNarrative", () => {
  it("names a few exercises and counts the rest", () => {
    const text = writeRulesNarrative({
      ...base,
      progressions: [
        ...["Squat", "Row", "Press", "Lunge"].map((n) => call(n, "progress")),
        ...Array.from({ length: 12 }, (_, i) => call(`Hold ${i}`, "hold")),
      ],
    });
    expect(text).toMatch(/Squat, Row and 2 more cleared their targets/);
    expect(text).toMatch(/The rest stay where they are for now\./);
    expect(text).not.toMatch(/Hold 5/);
  });
});
