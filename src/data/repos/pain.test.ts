import { describe, expect, it } from "vitest";
import { addPainFlag, listOpenPainFlags, resolvePainFlag, upsertOpenPainFlag } from "./pain";

describe("pain repo", () => {
  it("records a pain flag", async () => {
    const flag = await addPainFlag({
      location: "wrist",
      severity: 2,
      aggravatingMovement: "push-ups",
    });
    expect(flag.id).toBeGreaterThan(0);
    expect(flag.resolvedAt).toBeNull();
  });

  it("rejects severity outside 1-5", async () => {
    await expect(addPainFlag({ location: "ankle", severity: 0 })).rejects.toThrow();
    await expect(addPainFlag({ location: "ankle", severity: 6 })).rejects.toThrow();
  });

  it("resolving removes a flag from the open list", async () => {
    const flag = await addPainFlag({ location: "ankle", severity: 3 });
    await resolvePainFlag(flag.id);
    const openIds = (await listOpenPainFlags()).map((f) => f.id);
    expect(openIds).not.toContain(flag.id);
  });

  it("upsert updates the open flag for a location instead of duplicating", async () => {
    const first = await upsertOpenPainFlag({ location: "knee", severity: 2 });
    const second = await upsertOpenPainFlag({ location: "knee", severity: 3 });
    expect(second.id).toBe(first.id);
    expect(second.severity).toBe(3);
    const open = (await listOpenPainFlags()).filter(
      (f) => f.location === "knee",
    );
    expect(open.length).toBe(1);
  });

  it("upsert opens a fresh flag when the previous one is resolved", async () => {
    const first = await upsertOpenPainFlag({ location: "hip", severity: 2 });
    await resolvePainFlag(first.id);
    const second = await upsertOpenPainFlag({ location: "hip", severity: 2 });
    expect(second.id).not.toBe(first.id);
  });
});
