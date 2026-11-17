import { describe, expect, it } from "vitest";
import { composeDay, type DayActionDraft } from "./compose-day";

const workout: DayActionDraft = {
  domain: "fitness",
  kind: "workout",
  title: "Foundation A",
  workoutId: 1,
};
const food: DayActionDraft[] = [
  { domain: "fuel", kind: "food", title: "Defrost chicken" },
  { domain: "fuel", kind: "food", title: "Prep lunch box" },
];
const reminders: DayActionDraft[] = [
  { domain: "general", kind: "reminder", title: "Book dentist" },
];

describe("composeDay", () => {
  it("orders gym, food, reminders (doc 09 priority)", () => {
    const day = composeDay({ workout, foodActions: food, reminders });
    expect(day.map((a) => a.kind)).toEqual(["workout", "food", "food", "reminder"]);
  });

  it("composes without a workout", () => {
    const day = composeDay({ foodActions: food });
    expect(day.map((a) => a.title)).toEqual(["Defrost chicken", "Prep lunch box"]);
  });

  it("returns empty for empty inputs", () => {
    expect(composeDay({})).toEqual([]);
  });
});
