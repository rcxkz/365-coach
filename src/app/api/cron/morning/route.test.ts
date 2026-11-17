import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const sent: string[] = [];
vi.mock("@/services/push", () => ({
  vapidPublicKey: () => "test-key",
  sendPush: vi.fn(async (target: { endpoint: string }) => {
    sent.push(target.endpoint);
    return target.endpoint.includes("gone") ? "expired" : "sent";
  }),
}));

import { GET } from "./route";
import { EXERCISE_LIBRARY } from "@/data/library";
import { upsertExercises } from "@/data/repos/exercises";
import { listPushSubscriptions, savePushSubscription } from "@/data/repos/push";
import { getWorkoutByDate } from "@/data/repos/workouts";

const call = (auth = "Bearer cron-secret") =>
  GET(new Request("http://x/api/cron/morning", { headers: { authorization: auth } }));

describe("morning cron", () => {
  beforeAll(async () => {
    delete process.env.ANTHROPIC_API_KEY;
    vi.stubEnv("CRON_SECRET", "cron-secret");
    await upsertExercises(EXERCISE_LIBRARY);
    await savePushSubscription({ endpoint: "https://push/phone", p256dh: "k", auth: "a" });
    await savePushSubscription({ endpoint: "https://push/gone", p256dh: "k", auth: "a" });
  });
  afterAll(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("rejects calls without the cron secret", async () => {
    expect((await call("Bearer nope")).status).toBe(401);
  });

  it("plans at 6am London without sending anything", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-12-01T06:20:00Z")); // 06:20 GMT
    const body = await (await call()).json();
    expect(body).toMatchObject({ target: "2026-12-01", plan: "fallback", reminder: "not_now_6h" });
    expect(await getWorkoutByDate("2026-12-01")).not.toBeNull();
    expect(sent).toHaveLength(0);
  });

  it("sends once in the 7am hour and drops expired devices", async () => {
    vi.setSystemTime(new Date("2026-12-01T07:10:00Z"));
    const first = await (await call()).json();
    expect(first).toMatchObject({ plan: "already_planned", reminder: "sent_1_of_2" });
    expect((await listPushSubscriptions()).map((s) => s.endpoint)).toEqual(["https://push/phone"]);

    const again = await (await call()).json();
    expect(again.reminder).toBe("already_sent");
  });
});
