import { describe, expect, it } from "vitest";
import {
  claimReminder,
  deletePushSubscription,
  listPushSubscriptions,
  savePushSubscription,
} from "./push";

describe("push repo", () => {
  it("stores one row per endpoint and removes it", async () => {
    await savePushSubscription({ endpoint: "https://push/a", p256dh: "k1", auth: "a1" });
    await savePushSubscription({ endpoint: "https://push/a", p256dh: "k2", auth: "a2" });
    const rows = (await listPushSubscriptions()).filter((r) => r.endpoint === "https://push/a");
    expect(rows).toHaveLength(1);
    expect(rows[0].p256dh).toBe("k2");
    await deletePushSubscription("https://push/a");
    expect(await listPushSubscriptions()).toHaveLength(0);
  });

  it("lets a reminder be claimed once per day", async () => {
    expect(await claimReminder("morning", "2026-10-23")).toBe(true);
    expect(await claimReminder("morning", "2026-10-23")).toBe(false);
    expect(await claimReminder("morning", "2026-10-24")).toBe(true);
  });
});
