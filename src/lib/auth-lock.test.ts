import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { forgetLockHash, isValidSession, lockTokenFor, passcodeState, signingSecret } from "./auth";
import { hashPasscode } from "./passcode";
import { claimLock, replaceLockHash } from "@/data/repos/lock";

/** A copy with no APP_PASSCODE: the owner chooses one in the app. */
describe("a passcode chosen in the app", () => {
  beforeEach(() => {
    vi.stubEnv("APP_PASSCODE", "");
    vi.stubEnv("AUTH_SECRET", "test-signing-secret");
    vi.stubEnv("DEMO_MODE", "");
    vi.stubEnv("NODE_ENV", "production");
    forgetLockHash();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("starts unclaimed and locked, then lets only the first claim win", async () => {
    expect(await passcodeState()).toBe("unclaimed");
    expect(await isValidSession("anything")).toBe(false);

    const first = await hashPasscode("first owner phrase");
    expect(await claimLock(first)).toBe(true);
    expect(await claimLock(await hashPasscode("someone else"))).toBe(false);
    expect(await passcodeState()).toBe("claimed");

    const cookie = await lockTokenFor(signingSecret()!, first);
    expect(await isValidSession(cookie)).toBe(true);
    expect(await isValidSession(undefined)).toBe(false);
    expect(await isValidSession(await lockTokenFor("other-secret", first))).toBe(false);
  });

  it("signs old cookies out when the passcode changes", async () => {
    const secret = signingSecret()!;
    const before = await hashPasscode("first owner phrase");
    await claimLock(before); // already claimed by the test above in this database
    const current = (await import("@/data/repos/lock")).getLockHash;
    const oldCookie = await lockTokenFor(secret, (await current())!);
    expect(await isValidSession(oldCookie)).toBe(true);

    const after = await hashPasscode("a brand new phrase");
    await replaceLockHash(after);
    forgetLockHash();
    expect(await isValidSession(oldCookie)).toBe(false);
    expect(await isValidSession(await lockTokenFor(secret, after))).toBe(true);
  });
});
