import { describe, expect, it } from "vitest";
import { shortenWorkout } from "./shorten";

const exercises = [
  { name: "Assisted pull-up", inShortVersion: true },
  { name: "Incline dumbbell press", inShortVersion: true },
  { name: "Goblet squat", inShortVersion: false },
  { name: "Dead bug", inShortVersion: true },
  { name: "Farmer carry", inShortVersion: false },
];

describe("shortenWorkout", () => {
  it("keeps only short-version exercises, preserving order", () => {
    const short = shortenWorkout(exercises);
    expect(short.map((e) => e.name)).toEqual([
      "Assisted pull-up",
      "Incline dumbbell press",
      "Dead bug",
    ]);
  });

  it("falls back to the first three when nothing is flagged", () => {
    const unflagged = exercises.map((e) => ({ ...e, inShortVersion: false }));
    const short = shortenWorkout(unflagged);
    expect(short.map((e) => e.name)).toEqual([
      "Assisted pull-up",
      "Incline dumbbell press",
      "Goblet squat",
    ]);
  });

  it("returns a short list unchanged", () => {
    const two = exercises.slice(0, 2);
    expect(shortenWorkout(two)).toEqual(two);
  });
});
