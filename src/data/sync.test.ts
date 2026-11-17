import { describe, expect, it } from "vitest";
import { syncLibraries } from "./sync";

describe("syncLibraries", () => {
  it("syncs the exercise and meal libraries, idempotently", async () => {
    const first = await syncLibraries();
    expect(first.exercises).toBeGreaterThan(50);
    expect(first.meals).toBeGreaterThan(10);
    expect(await syncLibraries()).toEqual(first);
  });
});
