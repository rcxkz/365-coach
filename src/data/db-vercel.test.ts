import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllEnvs());

describe("getDb on Vercel without a database", () => {
  it("says what's missing and how to fix it", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("DATABASE_URL", "");
    const { getDb } = await import("./db");
    await expect(getDb()).rejects.toThrow(/DATABASE_URL is not set.*Neon Postgres.*redeploy/);
  });
});
