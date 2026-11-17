import { describe, expect, it } from "vitest";
import { pickNextSession } from "./rotation";
import { BLOCK1_ROTATION } from "./templates";

describe("pickNextSession", () => {
  it("starts at the top of the rotation with no history", () => {
    const next = pickNextSession(BLOCK1_ROTATION, [], "green");
    expect(next.key).toBe("A");
  });

  it("prefers never-done sessions over recently-done ones", () => {
    const next = pickNextSession(BLOCK1_ROTATION, ["A", "B"], "green");
    expect(next.key).toBe("C");
  });

  it("picks the least-recently-done once everything has been done", () => {
    // Most-recent first: F was yesterday … A was longest ago.
    const next = pickNextSession(
      BLOCK1_ROTATION,
      ["F", "E", "D", "C", "B", "A"],
      "green",
    );
    expect(next.key).toBe("A");
  });

  it("skips green-only sessions on a yellow day", () => {
    // F (skill_development) is due but needs green readiness.
    const next = pickNextSession(
      BLOCK1_ROTATION,
      ["E", "D", "C", "B", "A", "F"],
      "yellow",
    );
    // A is the least-recently-done session that yellow allows.
    expect(next.key).toBe("A");
  });

  it("only offers recovery on a red day", () => {
    const next = pickNextSession(BLOCK1_ROTATION, [], "red");
    expect(next.key).toBe("C");
    expect(next.templateId).toBe("recovery");
  });

  it("never crashes on a rotation with no readiness match", () => {
    const skillOnly = BLOCK1_ROTATION.filter((entry) => entry.key === "F");
    const next = pickNextSession(skillOnly, [], "red");
    expect(next.key).toBe("F");
  });
});
