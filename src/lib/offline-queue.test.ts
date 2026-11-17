import { beforeEach, describe, expect, it, vi } from "vitest";
import { enqueue, flushQueue, queueSize, readQueue } from "./offline-queue";

/** Minimal localStorage so the queue can be tested in Node. */
function installStorage(): void {
  const store = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
  });
}

const entry = (overrides: Partial<Parameters<typeof enqueue>[0]> = {}) => ({
  action: "log" as const,
  exerciseId: 1,
  setNumber: 1,
  reps: 8,
  weightKg: null,
  ...overrides,
});

describe("offline queue", () => {
  beforeEach(() => {
    installStorage();
  });

  it("is empty and harmless before anything is queued", () => {
    expect(readQueue()).toEqual([]);
    expect(queueSize()).toBe(0);
  });

  it("queues entries and reports the size", () => {
    enqueue(entry());
    enqueue(entry({ setNumber: 2 }));
    expect(queueSize()).toBe(2);
  });

  it("supersedes an earlier intent for the same set", () => {
    enqueue(entry({ reps: 8 }));
    enqueue(entry({ action: "unlog" }));
    enqueue(entry({ reps: 6 }));
    const queue = readQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ action: "log", reps: 6 });
  });

  it("replays log and unlog intents, then empties", async () => {
    enqueue(entry({ exerciseId: 3, reps: 10, weightKg: 20 }));
    enqueue(entry({ exerciseId: 4, setNumber: 2, action: "unlog" }));

    const log = vi.fn().mockResolvedValue(undefined);
    const unlog = vi.fn().mockResolvedValue(undefined);
    const remaining = await flushQueue({ log, unlog });

    expect(log).toHaveBeenCalledWith(3, 1, 10, 20);
    expect(unlog).toHaveBeenCalledWith(4, 2);
    expect(remaining).toBe(0);
    expect(queueSize()).toBe(0);
  });

  it("keeps entries that fail and drops the ones that succeed", async () => {
    enqueue(entry({ exerciseId: 1 }));
    enqueue(entry({ exerciseId: 2 }));

    const log = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(undefined);
    const remaining = await flushQueue({ log, unlog: vi.fn() });

    expect(remaining).toBe(1);
    expect(readQueue()[0].exerciseId).toBe(1);
  });

  it("replays oldest first", async () => {
    const order: number[] = [];
    enqueue(entry({ exerciseId: 1 }));
    await new Promise((resolve) => setTimeout(resolve, 2));
    enqueue(entry({ exerciseId: 2 }));

    await flushQueue({
      log: async (exerciseId) => void order.push(exerciseId),
      unlog: vi.fn(),
    });
    expect(order).toEqual([1, 2]);
  });

  it("survives corrupt stored data", () => {
    window.localStorage.setItem("p365.pending-sets.v1", "{not json");
    expect(readQueue()).toEqual([]);
  });
});
