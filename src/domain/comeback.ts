/**
 * Coming back (Phase 8 design): pausing while unwell or away, and
 * easing back in afterwards. Doc 10 names "returning after time away"
 * as something to celebrate, never to shame — and the honest failure
 * mode is the opposite of guilt: a first session back planned at the
 * old loads, which goes badly, which ends the return.
 *
 * Pure: the caller supplies dates and pauses; this decides.
 */

/** A stretch this long without training changes how the next one is planned. */
export const RETURN_GAP_DAYS = 10;

/** Sessions it takes to ease back in before normal planning resumes. */
export const RAMP_SESSIONS = 3;

export const PAUSE_REASONS = ["unwell", "break"] as const;
export type PauseReason = (typeof PAUSE_REASONS)[number];

export interface Pause {
  reason: PauseReason;
  startedOn: string;
  endedOn: string | null;
}

export type ReturnState =
  | { kind: "normal" }
  | { kind: "paused"; reason: PauseReason; since: string }
  | {
      kind: "returning";
      cause: PauseReason | "gap";
      daysAway: number;
      /** 1-based: which session back this one is. */
      session: number;
      /** Multiplier on the last load used before the gap. */
      loadFactor: number;
      maxSets: number;
    };

export function daysBetween(from: string, to: string): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/**
 * Where the ramp starts. Longer away, lighter start: a fortnight off
 * costs little real strength, two months costs some, and either way
 * the first session's job is to be finished, not to test anything.
 * Being unwell starts lighter still — the body is recovering from
 * more than the time off.
 */
function startingLoadFactor(daysAway: number, cause: PauseReason | "gap"): number {
  const base = daysAway < 21 ? 0.85 : daysAway < 42 ? 0.75 : 0.65;
  return cause === "unwell" ? Math.min(base, 0.8) : base;
}

/**
 * - An open pause means paused: no training is planned.
 * - Otherwise, the most recent gap of RETURN_GAP_DAYS or more between
 *   trained days (or since the last one, up to today), or an unwell
 *   pause of any length, starts a ramp of RAMP_SESSIONS sessions.
 *   Loads climb back towards normal across the ramp.
 * - No training history at all is a first start, not a return —
 *   Block 1 is already built for that.
 *
 * `trainedDates` are days before `today` with a completed or logged
 * session, any order.
 */
export function assessReturn(input: {
  today: string;
  trainedDates: string[];
  pauses: Pause[];
}): ReturnState {
  const open = input.pauses.find((pause) => pause.endedOn === null);
  if (open) return { kind: "paused", reason: open.reason, since: open.startedOn };

  const dates = [...new Set(input.trainedDates)]
    .filter((date) => date < input.today)
    .sort()
    .reverse();
  if (dates.length === 0) return { kind: "normal" };

  type Candidate = { cause: PauseReason | "gap"; daysAway: number; after: string };
  const candidates: Candidate[] = [];

  // The most recent long gap: walk back from today through trained days.
  let later = input.today;
  for (const date of dates) {
    const gap = daysBetween(date, later);
    if (gap >= RETURN_GAP_DAYS) {
      candidates.push({ cause: "gap", daysAway: gap, after: date });
      break;
    }
    later = date;
  }

  // The most recent unwell pause, however short.
  const lastUnwell = input.pauses
    .filter((pause) => pause.reason === "unwell" && pause.endedOn !== null)
    .sort((a, b) => (a.startedOn < b.startedOn ? 1 : -1))[0];
  if (lastUnwell) {
    const lastBefore = dates.find((date) => date < lastUnwell.startedOn);
    candidates.push({
      cause: "unwell",
      daysAway: daysBetween(lastBefore ?? lastUnwell.startedOn, lastUnwell.endedOn!),
      // Sessions on or after the day they felt better count towards the ramp.
      after: addDay(lastUnwell.endedOn!, -1),
    });
  }

  // Of the returns still in progress, the most recent one decides.
  const active = candidates
    .map((candidate) => ({
      ...candidate,
      done: dates.filter((date) => date > candidate.after).length,
    }))
    .filter((candidate) => candidate.done < RAMP_SESSIONS)
    .sort((a, b) => (a.after < b.after ? 1 : -1))[0];
  if (!active) return { kind: "normal" };

  const start = startingLoadFactor(active.daysAway, active.cause);
  const loadFactor =
    Math.round((start + ((1 - start) * active.done) / RAMP_SESSIONS) * 100) / 100;
  return {
    kind: "returning",
    cause: active.cause,
    daysAway: active.daysAway,
    session: active.done + 1,
    loadFactor,
    maxSets: active.done === 0 ? 2 : 3,
  };
}

function addDay(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Rounded down to the nearest kilo: lighter is the safe side of wrong. */
export function easedLoad(lastKg: number, loadFactor: number): number {
  return Math.max(0, Math.floor(lastKg * loadFactor));
}

/** The one-line "why" carried on a returning session. */
export function returnRationale(
  state: Extract<ReturnState, { kind: "returning" }>,
): string {
  const away =
    state.cause === "unwell"
      ? "after being unwell"
      : `after ${state.daysAway} days away`;
  if (state.session === 1) {
    return `First session back ${away} — lighter on purpose. Finishing it feeling good is the whole job.`;
  }
  return `Session ${state.session} of ${RAMP_SESSIONS} back ${away} — a step closer to your usual loads.`;
}
