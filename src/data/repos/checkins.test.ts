import { describe, expect, it } from "vitest";
import { getCheckin, upsertCheckin } from "./checkins";

describe("checkins repo", () => {
  it("creates a check-in for a date", async () => {
    const checkin = await upsertCheckin("2026-07-26", { energy: "normal" });
    expect(checkin.date).toBe("2026-07-26");
    expect(checkin.energy).toBe("normal");
  });

  it("updates instead of duplicating on the same date", async () => {
    await upsertCheckin("2026-07-27", { energy: "low" });
    const updated = await upsertCheckin("2026-07-27", {
      energy: "high",
      timeAvailableMinutes: 45,
    });
    expect(updated.energy).toBe("high");
    expect(updated.timeAvailableMinutes).toBe(45);
    const fetched = await getCheckin("2026-07-27");
    expect(fetched?.energy).toBe("high");
  });

  it("returns null for a date with no check-in", async () => {
    expect(await getCheckin("1999-01-01")).toBeNull();
  });

  it("stores sleep and soreness (check-in v2)", async () => {
    const checkin = await upsertCheckin("2026-07-28", {
      energy: "normal",
      sleep: "poor",
      soreness: "heavy",
    });
    expect(checkin.sleep).toBe("poor");
    expect(checkin.soreness).toBe("heavy");
  });

  it("preserves unspecified fields on partial update", async () => {
    await upsertCheckin("2026-07-29", {
      energy: "normal",
      sleep: "good",
      soreness: "mild",
    });
    const updated = await upsertCheckin("2026-07-29", { energy: "low" });
    expect(updated.energy).toBe("low");
    expect(updated.sleep).toBe("good");
    expect(updated.soreness).toBe("mild");
  });
});
