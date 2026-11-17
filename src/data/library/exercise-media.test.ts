import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EXERCISE_LIBRARY } from "./index";
import { demoSearchUrl, EXERCISE_PHOTOS, exercisePhotos } from "./exercise-media";

describe("exercise photos", () => {
  it("only map exercises that exist, to files that exist", () => {
    const ids = new Set(EXERCISE_LIBRARY.map((exercise) => exercise.id));
    for (const id of Object.keys(EXERCISE_PHOTOS)) {
      expect(ids.has(id), id).toBe(true);
      for (const src of exercisePhotos(id)!) {
        expect(existsSync(join(process.cwd(), "public", src)), src).toBe(true);
      }
    }
  });

  it("returns nothing for unmapped or custom exercises", () => {
    expect(exercisePhotos("sauna_session")).toBeNull();
    expect(exercisePhotos(null)).toBeNull();
  });

  it("builds a demo search for any name", () => {
    expect(demoSearchUrl("Goblet Squat")).toBe(
      "https://www.youtube.com/results?search_query=Goblet%20Squat%20exercise%20form",
    );
  });
});
