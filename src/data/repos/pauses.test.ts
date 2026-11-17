import { describe, expect, it } from "vitest";
import { endPause, getOpenPause, listPauses, startPause } from "./pauses";

describe("pauses repo", () => {
  it("opens one pause at a time and ends it", async () => {
    const first = await startPause("unwell", "2026-10-01");
    const again = await startPause("break", "2026-10-02");
    expect(again.id).toBe(first.id);
    expect((await getOpenPause())?.reason).toBe("unwell");

    const ended = await endPause("2026-10-05");
    expect(ended?.endedOn).toBe("2026-10-05");
    expect(await getOpenPause()).toBeNull();
    expect(await endPause("2026-10-06")).toBeNull();

    const history = await listPauses();
    expect(history[0]).toMatchObject({ startedOn: "2026-10-01", endedOn: "2026-10-05" });
  });

  it("never ends a pause before it started", async () => {
    await startPause("break", "2026-11-10");
    const ended = await endPause("2026-11-01");
    expect(ended?.endedOn).toBe("2026-11-10");
  });
});
