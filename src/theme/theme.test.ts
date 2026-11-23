import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { showMakerStamp } from "./brand";

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(tsx?|css)$/.test(name) && !name.endsWith(".test.ts") ? [path] : [];
  });
}

describe("the look lives in src/theme", () => {
  // Restyling the app should mean editing src/theme only.
  it("has no hex colours anywhere else in src", () => {
    const stray = sourceFiles("src")
      .filter((path) => !path.startsWith(join("src", "theme")))
      .filter((path) => /#[0-9a-f]{6}\b/i.test(readFileSync(path, "utf8")));
    expect(stray).toEqual([]);
  });
});

describe("showMakerStamp", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is hidden on a copy by default", () => {
    vi.stubEnv("DEMO_MODE", "");
    vi.stubEnv("MAKER_STAMP", "");
    expect(showMakerStamp()).toBe(false);
  });

  it("shows on the demo, or when switched on", () => {
    vi.stubEnv("DEMO_MODE", "1");
    expect(showMakerStamp()).toBe(true);
    vi.stubEnv("DEMO_MODE", "");
    vi.stubEnv("MAKER_STAMP", "1");
    expect(showMakerStamp()).toBe(true);
  });
});
