import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { authConfig, isValidSession, safeEqual, sessionTokenFor } from "./auth";

afterEach(() => vi.unstubAllEnvs());

describe("safeEqual", () => {
  it("matches only identical strings", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual("", "")).toBe(true);
  });
});

describe("isValidSession", () => {
  it("admits the token signed for the current passcode", async () => {
    vi.stubEnv("AUTH_SECRET", "s3cret");
    vi.stubEnv("APP_PASSCODE", "pass");
    const token = await sessionTokenFor({ secret: "s3cret", passcode: "pass" });
    expect(await isValidSession(token)).toBe(true);
    expect(await isValidSession(undefined)).toBe(false);
    expect(await isValidSession("forged")).toBe(false);
  });

  it("opens the demo, but never a deployment with a passcode", async () => {
    vi.stubEnv("DEMO_MODE", "1");
    vi.stubEnv("APP_PASSCODE", "");
    vi.stubEnv("AUTH_SECRET", "");
    expect(await isValidSession(undefined)).toBe(true);
    // DEMO_MODE left on by mistake on a real deployment: still locked.
    vi.stubEnv("APP_PASSCODE", "pass");
    vi.stubEnv("AUTH_SECRET", "s3cret");
    expect(await isValidSession(undefined)).toBe(false);
  });

  it("signs every device out when the passcode changes", async () => {
    const old = await sessionTokenFor({ secret: "s3cret", passcode: "old" });
    vi.stubEnv("AUTH_SECRET", "s3cret");
    vi.stubEnv("APP_PASSCODE", "new");
    expect(await isValidSession(old)).toBe(false);
  });

  it("needs only the passcode on a deployment with a database", async () => {
    vi.stubEnv("AUTH_SECRET", "");
    vi.stubEnv("APP_PASSCODE", "pass");
    vi.stubEnv("DATABASE_URL", "postgres://user:long-secret@host/db");
    const config = authConfig();
    expect(config).not.toBeNull();
    expect(config!.secret).toContain("long-secret");
    const token = await sessionTokenFor(config!);
    expect(await isValidSession(token)).toBe(true);
    // A cookie signed some other way doesn't get in.
    expect(await isValidSession(await sessionTokenFor({ secret: "guess", passcode: "pass" }))).toBe(false);
  });

  it("still fails closed with a passcode but nothing to sign with", async () => {
    vi.stubEnv("AUTH_SECRET", "");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("APP_PASSCODE", "pass");
    vi.stubEnv("NODE_ENV", "production");
    expect(authConfig()).toBeNull();
    expect(await isValidSession(undefined)).toBe(false);
  });

  it("fails closed outside development when unconfigured", async () => {
    vi.stubEnv("AUTH_SECRET", "");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("APP_PASSCODE", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(await isValidSession(undefined)).toBe(false);
    vi.stubEnv("NODE_ENV", "development");
    expect(await isValidSession(undefined)).toBe(true);
  });
});

/**
 * A server action is callable by POSTing its id to any page, the
 * public /unlock included — the proxy alone doesn't protect it.
 */
describe("server actions", () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.tsx?$/.test(name)) files.push(path);
    }
  };
  walk(join(process.cwd(), "src"));
  const actionFiles = files.filter(
    (f) =>
      readFileSync(f, "utf8").startsWith('"use server"') &&
      !f.includes(join("app", "unlock")),
  );

  it("are found", () => expect(actionFiles.length).toBeGreaterThan(0));

  it.each(actionFiles)("%s checks the session first", (file) => {
    const source = readFileSync(file, "utf8");
    const exported = [
      ...source.matchAll(/export async function (\w+)\([\s\S]*?\{\n(.*)/g),
    ];
    expect(exported.length).toBeGreaterThan(0);
    for (const [, name, firstLine] of exported) {
      expect(firstLine.trim(), name).toBe("await requireSession();");
    }
  });
});
