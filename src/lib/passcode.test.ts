import { describe, expect, it } from "vitest";
import { hashPasscode, passcodeProblem, verifyPasscode } from "./passcode";

describe("passcode hashing", () => {
  it("stores a salted hash that only the right passcode matches", async () => {
    const a = await hashPasscode("a long passphrase");
    const b = await hashPasscode("a long passphrase");
    expect(a).not.toContain("a long passphrase");
    expect(a).not.toBe(b); // a fresh salt each time
    expect(await verifyPasscode("a long passphrase", a)).toBe(true);
    expect(await verifyPasscode("a long passphrasf", a)).toBe(false);
    expect(await verifyPasscode("anything", "not-a-hash")).toBe(false);
  });

  it("asks for something memorable and typed the same twice", () => {
    expect(passcodeProblem("short", "short")).toMatch(/at least 8/);
    expect(passcodeProblem("a long passphrase", "a long passphrasf")).toMatch(/didn't match/);
    expect(passcodeProblem("a long passphrase", "a long passphrase")).toBeNull();
  });
});
