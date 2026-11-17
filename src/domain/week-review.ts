import { defaultRepsFor } from "./targets";
import { summariseFeelings, summariseTrackers, type JournalEntry } from "./journal";
import type { CustomTracker } from "./profile";

/**
 * Weekly review (playbook doc 03: "use weekly reviews for deeper
 * adjustments"). The daily loop deliberately doesn't decide
 * progression; this does, once a week, from what was actually logged.
 *
 * Pure and deterministic — the AI only rewrites this into prose, so a
 * review still exists (and still says the same thing) with no AI.
 */

export interface LoggedSet {
  reps: number;
  weightKg: number | null;
}

export interface ReviewExercise {
  libraryExerciseId: string | null;
  name: string;
  targetSets: number;
  targetReps: string;
  included: boolean;
  sets: LoggedSet[];
}

export interface ReviewSession {
  date: string;
  title: string;
  status: "planned" | "completed" | "skipped";
  rotationKey: string | null;
  exercises: ReviewExercise[];
}

export interface ReviewPain {
  location: string;
  severity: number;
  openedOn: string;
  resolvedOn: string | null;
}

export interface WeekInput {
  weekStart: string;
  weekEnd: string;
  sessions: ReviewSession[];
  pain: ReviewPain[];
  /** Completed sessions in the week before, for a like-for-like line. */
  previousWeekSessions: number;
  /** The week's "how I feel" journal entries (Phase 12). */
  journal?: JournalEntry[];
  /** The user's own trackers, summarised alongside (Phase 15). */
  trackers?: CustomTracker[];
}

export type ProgressionCall = "progress" | "hold" | "ease";

export interface ProgressionSuggestion {
  libraryExerciseId: string;
  name: string;
  call: ProgressionCall;
  reason: string;
}

export interface WeekSummary {
  weekStart: string;
  weekEnd: string;
  sessionsCompleted: number;
  setsLogged: number;
  previousWeekSessions: number;
  /** Genuine, specific, proportionate (doc 10) — never padded. */
  wins: string[];
  progressions: ProgressionSuggestion[];
  watchouts: string[];
  /** "How you felt" lines from the journal. Absent on older reviews. */
  feelings?: string[];
}

/** Every working set met the top of its rep target. */
function clearedTarget(exercise: ReviewExercise): boolean {
  const target = defaultRepsFor(exercise.targetReps);
  return (
    exercise.sets.length >= exercise.targetSets &&
    exercise.sets.every((set) => set.reps >= target)
  );
}

function fellShort(exercise: ReviewExercise): boolean {
  const target = defaultRepsFor(exercise.targetReps);
  return exercise.sets.some((set) => set.reps < target);
}

function area(location: string): string {
  return location.replace(/_/g, " ");
}

/**
 * Doc 12's progression philosophy, applied to the week's logs:
 * comfortable completion → progress, minor struggle → hold, pain →
 * ease off. Only exercises actually performed are judged.
 */
function decideProgressions(input: WeekInput): ProgressionSuggestion[] {
  const painfulAreas = new Set(
    input.pain.filter((p) => !p.resolvedOn).map((p) => p.location),
  );

  const byExercise = new Map<
    string,
    { name: string; cleared: number; short: number; sessions: number }
  >();

  for (const session of input.sessions) {
    for (const exercise of session.exercises) {
      if (!exercise.libraryExerciseId || exercise.sets.length === 0) continue;
      const entry = byExercise.get(exercise.libraryExerciseId) ?? {
        name: exercise.name,
        cleared: 0,
        short: 0,
        sessions: 0,
      };
      entry.sessions += 1;
      if (clearedTarget(exercise)) entry.cleared += 1;
      else if (fellShort(exercise)) entry.short += 1;
      byExercise.set(exercise.libraryExerciseId, entry);
    }
  }

  const suggestions: ProgressionSuggestion[] = [];
  for (const [libraryExerciseId, entry] of byExercise) {
    if (painfulAreas.size > 0 && entry.short > 0) {
      suggestions.push({
        libraryExerciseId,
        name: entry.name,
        call: "ease",
        reason: `Reps came up short while pain was open — keep the load where it is or take a regression.`,
      });
      continue;
    }
    if (entry.cleared >= 1 && entry.short === 0) {
      suggestions.push({
        libraryExerciseId,
        name: entry.name,
        call: "progress",
        reason:
          entry.sessions > 1
            ? "Every set hit the target across two sessions — ready for a small step up."
            : "Every set hit the target — ready for a small step up.",
      });
      continue;
    }
    if (entry.short > 0) {
      suggestions.push({
        libraryExerciseId,
        name: entry.name,
        call: "hold",
        reason: "Some sets came up short — repeat before adding anything.",
      });
    }
  }
  return suggestions.sort((a, b) => a.name.localeCompare(b.name));
}

function collectWins(input: WeekInput, summary: {
  sessionsCompleted: number;
  setsLogged: number;
  progressions: ProgressionSuggestion[];
}): string[] {
  const wins: string[] = [];

  if (summary.sessionsCompleted > 0) {
    wins.push(
      summary.sessionsCompleted === 1
        ? "One session done and logged."
        : `${summary.sessionsCompleted} sessions done and logged.`,
    );
  }
  if (
    summary.sessionsCompleted > input.previousWeekSessions &&
    input.previousWeekSessions > 0
  ) {
    wins.push(
      `That's more than last week's ${input.previousWeekSessions}.`,
    );
  }

  const ready = summary.progressions.filter((p) => p.call === "progress");
  if (ready.length > 0) {
    wins.push(
      ready.length === 1
        ? `${ready[0].name} cleared its target throughout.`
        : `${ready.length} movements cleared their targets throughout.`,
    );
  }

  const resolved = input.pain.filter((p) => p.resolvedOn);
  for (const flag of resolved) {
    wins.push(`${area(flag.location)} pain cleared.`);
  }

  const heaviest = heaviestSet(input);
  if (heaviest) {
    wins.push(
      `Top set of the week: ${heaviest.name} ${heaviest.reps} × ${heaviest.weightKg}kg.`,
    );
  }
  return wins;
}

function heaviestSet(
  input: WeekInput,
): { name: string; reps: number; weightKg: number } | null {
  let best: { name: string; reps: number; weightKg: number } | null = null;
  for (const session of input.sessions) {
    for (const exercise of session.exercises) {
      for (const set of exercise.sets) {
        if (set.weightKg && (!best || set.weightKg > best.weightKg)) {
          best = { name: exercise.name, reps: set.reps, weightKg: set.weightKg };
        }
      }
    }
  }
  return best;
}

function collectWatchouts(input: WeekInput): string[] {
  const watchouts: string[] = [];

  const stillOpen = input.pain.filter((p) => !p.resolvedOn);
  for (const flag of stillOpen) {
    watchouts.push(
      flag.severity >= 4
        ? `${area(flag.location)} is still severe — worth getting it assessed rather than working around it again.`
        : `${area(flag.location)} still flagged; sessions keep adapting around it.`,
    );
  }

  const shortened = input.sessions.filter(
    (session) =>
      session.status === "completed" &&
      session.exercises.some((exercise) => !exercise.included),
  ).length;
  if (shortened >= 2) {
    watchouts.push(
      `${shortened} sessions were shortened — if that's the week's shape, a shorter plan may simply fit better.`,
    );
  }

  const planned = input.sessions.filter(
    (session) => session.status === "planned",
  ).length;
  if (planned >= 3) {
    watchouts.push(
      "Several planned sessions weren't logged. Plans are a suggestion, not a debt — the rotation picks up wherever you are.",
    );
  }
  return watchouts;
}

export function summariseWeek(input: WeekInput): WeekSummary {
  const completed = input.sessions.filter(
    (session) => session.status === "completed",
  );
  const setsLogged = input.sessions.reduce(
    (count, session) =>
      count +
      session.exercises.reduce((sets, exercise) => sets + exercise.sets.length, 0),
    0,
  );
  const progressions = decideProgressions(input);

  const base = {
    sessionsCompleted: completed.length,
    setsLogged,
    progressions,
  };

  return {
    weekStart: input.weekStart,
    weekEnd: input.weekEnd,
    ...base,
    previousWeekSessions: input.previousWeekSessions,
    wins: collectWins(input, base),
    watchouts: collectWatchouts(input),
    feelings: [
      ...summariseFeelings({
        entries: input.journal ?? [],
        // Trained means a session done, or at least a set logged.
        trainedDates: input.sessions
          .filter(
            (session) =>
              session.status === "completed" ||
              session.exercises.some((exercise) => exercise.sets.length > 0),
          )
          .map((session) => session.date),
      }),
      ...summariseTrackers(input.journal ?? [], input.trackers ?? []),
    ],
  };
}
