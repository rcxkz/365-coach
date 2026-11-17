/**
 * Pending set-log writes, held locally until the network comes back.
 *
 * A gym basement kills the request, not the workout: taps update the
 * screen immediately, and anything that failed to reach the server is
 * replayed on reconnect. localStorage (not IndexedDB) is deliberate —
 * the payload is a handful of small records and synchronous reads keep
 * the tap path simple.
 *
 * Client-only; every function no-ops during SSR.
 */

const STORAGE_KEY = "p365.pending-sets.v1";

export interface PendingSet {
  /** Present-tense intent, replayed in order. */
  action: "log" | "unlog";
  exerciseId: number;
  setNumber: number;
  reps: number;
  weightKg: number | null;
  queuedAt: number;
}

function available(): boolean {
  return typeof window !== "undefined" && "localStorage" in window;
}

export function readQueue(): PendingSet[] {
  if (!available()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PendingSet[]) : [];
  } catch {
    return [];
  }
}

const listeners = new Set<() => void>();

/** Subscription for useSyncExternalStore — the queue is external state. */
export function subscribeToQueue(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

function writeQueue(queue: PendingSet[]): void {
  if (!available()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // Storage full or blocked: the set is already reflected on screen,
    // and losing the replay is better than breaking the tap.
  }
  for (const listener of listeners) listener();
}

/**
 * Queues an intent, superseding any earlier one for the same set — the
 * last thing the user did is the truth, so a log→unlog→log sequence
 * replays as a single write.
 */
export function enqueue(entry: Omit<PendingSet, "queuedAt">): void {
  const queue = readQueue().filter(
    (item) =>
      !(
        item.exerciseId === entry.exerciseId &&
        item.setNumber === entry.setNumber
      ),
  );
  queue.push({ ...entry, queuedAt: Date.now() });
  writeQueue(queue);
}

export function queueSize(): number {
  return readQueue().length;
}

/**
 * Replays pending writes oldest-first. Entries that fail stay queued
 * for the next attempt; entries that succeed are dropped. Returns how
 * many are still waiting.
 */
export async function flushQueue(handlers: {
  log: (
    exerciseId: number,
    setNumber: number,
    reps: number,
    weightKg: number | null,
  ) => Promise<void>;
  unlog: (exerciseId: number, setNumber: number) => Promise<void>;
}): Promise<number> {
  const queue = readQueue();
  if (queue.length === 0) return 0;

  const remaining: PendingSet[] = [];
  for (const entry of queue.sort((a, b) => a.queuedAt - b.queuedAt)) {
    try {
      if (entry.action === "log") {
        await handlers.log(
          entry.exerciseId,
          entry.setNumber,
          entry.reps,
          entry.weightKg,
        );
      } else {
        await handlers.unlog(entry.exerciseId, entry.setNumber);
      }
    } catch {
      remaining.push(entry);
    }
  }
  writeQueue(remaining);
  return remaining.length;
}
