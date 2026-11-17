import { addDaysISO } from "./dates";
import type { CustomTracker } from "./profile";
import type { CheckinEnergyLevel, CheckinSoreness } from "./readiness";

/**
 * The "how I feel" journal (Phase 12): anytime, tap-only entries about
 * body, mood and stress, and food. Each entry records only what was
 * tapped; the latest value of each thing is what counts. Pure: callers
 * pass entries in, this decides what they mean for training, food and
 * the weekly review.
 */

export const STRESS_LEVELS = ["low", "medium", "high"] as const;
export type StressLevel = (typeof STRESS_LEVELS)[number];

export const DIGESTION_STATES = ["good", "sluggish", "bloated", "unsettled"] as const;
export type DigestionState = (typeof DIGESTION_STATES)[number];

/** 1 (low) … 5 (great). */
export const MOOD_SCALE = [1, 2, 3, 4, 5] as const;

export interface JournalEntry {
  /** ISO date in the user's time zone. */
  date: string;
  /** When it was written, ISO timestamp — orders entries within a day. */
  at: string;
  mood: number | null;
  stress: StressLevel | null;
  energy: CheckinEnergyLevel | null;
  soreness: CheckinSoreness | null;
  digestion: DigestionState | null;
  /** The user's own trackers: id → a 1–5 score, a number, or yes/no. */
  custom?: Record<string, number | boolean>;
}

export interface CurrentFeeling {
  mood: number | null;
  stress: StressLevel | null;
  energy: CheckinEnergyLevel | null;
  soreness: CheckinSoreness | null;
  digestion: DigestionState | null;
}

/**
 * How they feel right now: the latest value of each thing from today's
 * entries, or last night's (an evening "stressed" still describes the
 * morning). Older than that is history, not now.
 */
export function currentFeeling(entries: JournalEntry[], today: string): CurrentFeeling {
  const yesterday = addDaysISO(today, -1);
  const recent = entries
    .filter((entry) => entry.date === today || entry.date === yesterday)
    .sort((a, b) => (a.at < b.at ? 1 : -1));
  const latest = <K extends keyof CurrentFeeling>(key: K): CurrentFeeling[K] =>
    (recent.find((entry) => entry[key] !== null)?.[key] ?? null) as CurrentFeeling[K];
  return {
    mood: latest("mood"),
    stress: latest("stress"),
    energy: latest("energy"),
    soreness: latest("soreness"),
    digestion: latest("digestion"),
  };
}

/** One calm line for the planners' prompts — context, not instructions. */
export function describeFeeling(feeling: CurrentFeeling): string[] {
  const lines: string[] = [];
  if (feeling.mood !== null && feeling.mood <= 2) lines.push("Mood is low today.");
  if (feeling.mood !== null && feeling.mood >= 4) lines.push("In a good mood today.");
  if (feeling.stress === "high") lines.push("Stress is running high.");
  if (feeling.energy === "low") lines.push("Energy is low.");
  if (feeling.digestion === "bloated" || feeling.digestion === "unsettled") {
    lines.push(`Stomach feels ${feeling.digestion}.`);
  }
  if (feeling.digestion === "sluggish") lines.push("Feeling sluggish after food.");
  return lines;
}

/**
 * Dinner on a hard day should ask little: stressed or flat means at
 * most 15 hands-on minutes (doc 04: low effort beats a takeaway).
 */
export function dinnerEffortCap(feeling: CurrentFeeling): number | undefined {
  return feeling.stress === "high" || feeling.energy === "low" ? 15 : undefined;
}

const ENERGY_SCORE: Record<CheckinEnergyLevel, number> = { low: 1, normal: 2, high: 3 };

function mean(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

/**
 * The weekly review's "how you felt" lines. Patterns are only named
 * when there's enough to stand on — two days on each side and a real
 * difference — because a confident pattern from one day is noise
 * dressed up as insight.
 */
export function summariseFeelings(input: {
  entries: JournalEntry[];
  trainedDates: string[];
}): string[] {
  const { entries } = input;
  if (entries.length === 0) return [];
  const lines: string[] = [];
  const days = new Set(entries.map((entry) => entry.date));
  lines.push(
    `${entries.length} journal ${entries.length === 1 ? "entry" : "entries"} across ${days.size} ${days.size === 1 ? "day" : "days"}.`,
  );

  const moods = entries.flatMap((entry) => (entry.mood === null ? [] : [entry.mood]));
  const avgMood = mean(moods);
  if (avgMood !== null && moods.length >= 2) {
    lines.push(`Mood averaged ${avgMood.toFixed(1)} out of 5.`);
  }

  const stressedDays = new Set(
    entries.filter((entry) => entry.stress === "high").map((entry) => entry.date),
  );
  if (stressedDays.size > 0) {
    lines.push(
      `Stress ran high on ${stressedDays.size} ${stressedDays.size === 1 ? "day" : "days"}.`,
    );
  }

  const trained = new Set(input.trainedDates);
  const energyByDay = new Map<string, number[]>();
  for (const entry of entries) {
    if (entry.energy === null) continue;
    energyByDay.set(entry.date, [...(energyByDay.get(entry.date) ?? []), ENERGY_SCORE[entry.energy]]);
  }
  const onTraining: number[] = [];
  const offTraining: number[] = [];
  for (const [date, scores] of energyByDay) {
    (trained.has(date) ? onTraining : offTraining).push(mean(scores)!);
  }
  if (onTraining.length >= 2 && offTraining.length >= 2) {
    const diff = mean(onTraining)! - mean(offTraining)!;
    if (diff >= 0.5) lines.push("Energy was higher on days you trained.");
    if (diff <= -0.5) lines.push("Energy was lower on training days — worth watching recovery.");
  }

  const stomachDays = new Set(
    entries
      .filter((entry) => entry.digestion === "bloated" || entry.digestion === "unsettled")
      .map((entry) => entry.date),
  );
  if (stomachDays.size >= 2) {
    lines.push(`Stomach was off on ${stomachDays.size} days — simpler meals may help.`);
  }
  return lines;
}

/**
 * Weekly lines for the user's own trackers (Phase 15): an average for
 * scales and numbers, days-with-yes for yes/no. Only trackers with data
 * get a line; nothing is inferred from them.
 */
export function summariseTrackers(entries: JournalEntry[], trackers: CustomTracker[]): string[] {
  const lines: string[] = [];
  for (const tracker of trackers) {
    const values = entries
      .map((entry) => ({ date: entry.date, value: entry.custom?.[tracker.id] }))
      .filter((item) => item.value !== undefined);
    if (values.length === 0) continue;
    if (tracker.kind === "yesno") {
      const yesDays = new Set(values.filter((item) => item.value === true).map((item) => item.date));
      const logged = new Set(values.map((item) => item.date));
      lines.push(`${tracker.label}: yes on ${yesDays.size} of ${logged.size} logged ${logged.size === 1 ? "day" : "days"}.`);
      continue;
    }
    const numbers = values.map((item) => Number(item.value)).filter(Number.isFinite);
    if (numbers.length === 0) continue;
    const avg = numbers.reduce((a, b) => a + b, 0) / numbers.length;
    const shown = tracker.kind === "scale" ? `${avg.toFixed(1)} out of 5` : `${Math.round(avg * 10) / 10}${tracker.unit ? ` ${tracker.unit}` : ""}`;
    lines.push(`${tracker.label}: averaged ${shown} across ${numbers.length} ${numbers.length === 1 ? "entry" : "entries"}.`);
  }
  return lines;
}
