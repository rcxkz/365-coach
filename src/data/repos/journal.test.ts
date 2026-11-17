import { describe, expect, it } from "vitest";
import {
  addJournalEntry,
  deleteJournalEntry,
  listJournalEntries,
  toJournalEntry,
} from "./journal";

describe("journal repo", () => {
  it("stores only what was tapped, newest first", async () => {
    await addJournalEntry({ date: "2026-10-22", stress: "high" });
    const later = await addJournalEntry({ date: "2026-10-23", mood: 4, digestion: "good" });
    const rows = await listJournalEntries("2026-10-22", "2026-10-23");
    expect(rows[0].id).toBe(later.id);
    expect(toJournalEntry(rows[0])).toMatchObject({
      date: "2026-10-23",
      mood: 4,
      stress: null,
      digestion: "good",
    });
  });

  it("rejects a mood off the scale", async () => {
    await expect(addJournalEntry({ date: "2026-10-23", mood: 7 })).rejects.toThrow();
  });

  it("deletes an entry", async () => {
    const row = await addJournalEntry({ date: "2026-11-01", energy: "low" });
    await deleteJournalEntry(row.id);
    expect(await listJournalEntries("2026-11-01", "2026-11-01")).toEqual([]);
  });
});

describe("journal repo — custom trackers", () => {
  it("round-trips the user's own values", async () => {
    await addJournalEntry({ date: "2026-12-01", custom: { steps: 9000, meds: true } });
    const [row] = await listJournalEntries("2026-12-01", "2026-12-01");
    expect(toJournalEntry(row).custom).toEqual({ steps: 9000, meds: true });
  });
});
