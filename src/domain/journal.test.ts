import { describe, expect, it } from "vitest";
import {
  currentFeeling,
  describeFeeling,
  dinnerEffortCap,
  summariseFeelings,
  summariseTrackers,
  type JournalEntry,
} from "./journal";

const blank = { mood: null, stress: null, energy: null, soreness: null, digestion: null };
const entry = (date: string, time: string, fields: Partial<JournalEntry>): JournalEntry => ({
  ...blank,
  date,
  at: `${date}T${time}:00Z`,
  ...fields,
});

describe("currentFeeling", () => {
  it("takes the latest value of each thing from today and last night", () => {
    const feeling = currentFeeling(
      [
        entry("2026-10-22", "21:00", { stress: "high", mood: 2 }),
        entry("2026-10-23", "07:30", { mood: 4 }),
        entry("2026-10-20", "09:00", { energy: "low" }),
      ],
      "2026-10-23",
    );
    expect(feeling).toEqual({ mood: 4, stress: "high", energy: null, soreness: null, digestion: null });
  });
});

describe("what it means", () => {
  it("caps dinner effort when stressed or flat", () => {
    const calm = { mood: null, stress: null, energy: null, soreness: null, digestion: null };
    expect(dinnerEffortCap({ ...calm, stress: "high" })).toBe(15);
    expect(dinnerEffortCap({ ...calm, mood: 2, stress: "low", energy: "normal" })).toBeUndefined();
  });

  it("describes calmly, only what's notable", () => {
    expect(
      describeFeeling({ mood: 3, stress: "high", energy: "normal", soreness: null, digestion: "bloated" }),
    ).toEqual(["Stress is running high.", "Stomach feels bloated."]);
  });
});

describe("summariseFeelings", () => {
  it("says nothing without entries", () => {
    expect(summariseFeelings({ entries: [], trainedDates: [] })).toEqual([]);
  });

  it("names a pattern only with enough days on each side", () => {
    const entries = [
      entry("2026-10-19", "08:00", { energy: "high", mood: 4 }),
      entry("2026-10-21", "08:00", { energy: "high", mood: 4 }),
      entry("2026-10-20", "08:00", { energy: "low", stress: "high", mood: 2 }),
      entry("2026-10-22", "08:00", { energy: "low", digestion: "bloated" }),
      entry("2026-10-23", "08:00", { digestion: "unsettled" }),
    ];
    const lines = summariseFeelings({ entries, trainedDates: ["2026-10-19", "2026-10-21"] });
    expect(lines).toContain("Energy was higher on days you trained.");
    expect(lines).toContain("Stress ran high on 1 day.");
    expect(lines).toContain("Mood averaged 3.3 out of 5.");
    expect(lines).toContain("Stomach was off on 2 days — simpler meals may help.");

    const thin = summariseFeelings({ entries: entries.slice(0, 3), trainedDates: ["2026-10-19"] });
    expect(thin.join(" ")).not.toMatch(/trained/);
  });
});

describe("summariseTrackers", () => {
  it("averages scales and numbers, counts yes-days, skips the empty", () => {
    const trackers = [
      { id: "headache", label: "Headache", kind: "scale" as const, unit: "" },
      { id: "steps", label: "Steps", kind: "number" as const, unit: "steps" },
      { id: "meds", label: "Took meds", kind: "yesno" as const, unit: "" },
      { id: "water", label: "Water", kind: "number" as const, unit: "glasses" },
    ];
    const lines = summariseTrackers(
      [
        entry("2026-10-19", "08:00", { custom: { headache: 2, steps: 8000, meds: true } }),
        entry("2026-10-20", "08:00", { custom: { headache: 4, steps: 6000, meds: false } }),
        entry("2026-10-21", "08:00", { custom: { meds: true } }),
      ],
      trackers,
    );
    expect(lines).toEqual([
      "Headache: averaged 3.0 out of 5 across 2 entries.",
      "Steps: averaged 7,000 steps across 2 entries.",
      "Took meds: yes on 2 of 3 logged days.",
    ]);
  });
});
