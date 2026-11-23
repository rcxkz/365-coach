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

const sameSet = (a: { exerciseId: number; setNumber: number }, b: { exerciseId: number; setNumber: number }) =>
  a.exerciseId === b.exerciseId && a.setNumber === b.setNumber;

/**
 * Forgets any queued intent for a set. Called when a later tap for that
 * set reached the server directly, so an older queued intent can't
 * replay over it (undo, then the stale "log" coming back).
 */
export function dropQueued(exerciseId: number, setNumber: number): void {
  const queue = readQueue();
  const kept = queue.filter((item) => !sameSet(item, { exerciseId, setNumber }));
  if (kept.length !== queue.length) writeQueue(kept);
}

/** Removes one exact entry, leaving anything queued since untouched. */
function settle(entry: PendingSet): void {
  writeQueue(
    readQueue().filter(
      (item) => !(sameSet(item, entry) && item.queuedAt === entry.queuedAt),
    ),
  );
}

/**
 * The server's answer when a set's exercise no longer exists (removed
 * with "Not for me", a different session, a re-plan). Retrying can't
 * help, so the entry is dropped rather than retried forever.
 */
export const GONE = "gone" as const;

let flushing: Promise<number> | null = null;

/**
 * Replays pending writes oldest-first. Each entry is removed from
 * storage as soon as it lands (or turns out to be gone), so sets tapped
 * while a flush is running are never overwritten. Overlapping calls —
 * mount, reconnect, the retry timer, the app coming to the front —
 * share the one flush in progress. Returns how many are still waiting.
 */
export function flushQueue(handlers: {
  log: (
    exerciseId: number,
    setNumber: number,
    reps: number,
    weightKg: number | null,
  ) => Promise<unknown>;
  unlog: (exerciseId: number, setNumber: number) => Promise<unknown>;
}): Promise<number> {
  if (flushing) return flushing;
  flushing = (async () => {
    try {
      const snapshot = readQueue().sort((a, b) => a.queuedAt - b.queuedAt);
      for (const entry of snapshot) {
        try {
          if (entry.action === "log") {
            await handlers.log(entry.exerciseId, entry.setNumber, entry.reps, entry.weightKg);
          } else {
            await handlers.unlog(entry.exerciseId, entry.setNumber);
          }
          settle(entry);
        } catch {
          // Still offline, or the server is down: keep it for next time.
        }
      }
      return readQueue().length;
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}
