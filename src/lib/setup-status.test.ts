import { afterEach, describe, expect, it, vi } from "vitest";
import { configProblems, isMissingTables } from "./setup-status";

afterEach(() => vi.unstubAllEnvs());

describe("configProblems", () => {
  it("asks for a database on Vercel, and nothing locally", () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("VERCEL", "1");
    expect(configProblems()).toContain("no_database");
    vi.stubEnv("VERCEL", "");
    expect(configProblems()).not.toContain("no_database");
  });

  it("asks for a passcode in production, except on the demo", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_PASSCODE", "");
    vi.stubEnv("DEMO_MODE", "");
    expect(configProblems()).toContain("no_passcode");
    vi.stubEnv("DEMO_MODE", "1");
    expect(configProblems()).not.toContain("no_passcode");
  });

  it("is happy with a database and a passcode alone", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("DEMO_MODE", "");
    vi.stubEnv("AUTH_SECRET", "");
    vi.stubEnv("DATABASE_URL", "postgres://user:secret@host/db");
    vi.stubEnv("APP_PASSCODE", "a long passphrase");
    expect(configProblems()).toEqual([]);
  });
});

describe("isMissingTables", () => {
  it("spots Postgres's undefined-table error, wrapped or not", () => {
    const pg = Object.assign(new Error('relation "profile" does not exist'), { code: "42P01" });
    expect(isMissingTables(pg)).toBe(true);
    expect(isMissingTables(new Error("Failed query: select …", { cause: pg }))).toBe(true);
    expect(isMissingTables(new Error("connection refused"))).toBe(false);
  });
});
