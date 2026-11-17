import { describe, expect, it } from "vitest";
import {
  addMemory,
  archiveMemory,
  confirmMemory,
  listMemories,
} from "./memories";

describe("memories repo", () => {
  it("adds a memory with sensible defaults", async () => {
    const memory = await addMemory({
      tier: "long_term",
      domain: "fitness",
      content: "Prefers incline dumbbell press over barbell bench",
    });
    expect(memory.id).toBeGreaterThan(0);
    expect(memory.status).toBe("active");
    expect(memory.lastConfirmedAt).toBeNull();
  });

  it("defaults domain to general", async () => {
    const memory = await addMemory({
      tier: "temporary",
      content: "Low energy today",
    });
    expect(memory.domain).toBe("general");
  });

  it("filters by tier and domain", async () => {
    await addMemory({ tier: "active", domain: "money", content: "Watching takeaway spend" });
    const active = await listMemories({ tier: "active", domain: "money" });
    expect(active.length).toBeGreaterThan(0);
    expect(active.every((m) => m.tier === "active" && m.domain === "money")).toBe(true);
  });

  it("archives a memory out of the active list", async () => {
    const memory = await addMemory({ tier: "temporary", content: "One-off note" });
    await archiveMemory(memory.id);
    const activeIds = (await listMemories({ status: "active" })).map((m) => m.id);
    expect(activeIds).not.toContain(memory.id);
  });

  it("confirm stamps lastConfirmedAt", async () => {
    const memory = await addMemory({ tier: "active", domain: "fitness", content: "Wrist discomfort" });
    await confirmMemory(memory.id);
    const [refetched] = (await listMemories()).filter((m) => m.id === memory.id);
    expect(refetched.lastConfirmedAt).not.toBeNull();
  });
});
