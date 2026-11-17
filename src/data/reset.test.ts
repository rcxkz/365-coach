import { afterEach, describe, expect, it, vi } from "vitest";
import { addMemory, listMemories } from "./repos/memories";
import { resetAllData } from "./reset";

afterEach(() => vi.unstubAllEnvs());

describe("resetAllData", () => {
  it("refuses outside the demo, and on anything with a passcode", async () => {
    await expect(resetAllData()).rejects.toThrow(/refused/);
    vi.stubEnv("DEMO_MODE", "1");
    vi.stubEnv("APP_PASSCODE", "real-app");
    await expect(resetAllData()).rejects.toThrow(/refused/);
  });

  it("empties every table in the demo", async () => {
    await addMemory({ tier: "long_term", domain: "fitness", content: "x" });
    vi.stubEnv("DEMO_MODE", "1");
    vi.stubEnv("APP_PASSCODE", "");
    await resetAllData();
    expect(await listMemories()).toEqual([]);
  });
});
