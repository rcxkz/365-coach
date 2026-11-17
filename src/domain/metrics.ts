/**
 * Progress metrics (Phase 2 design §4, playbook doc 13). Small set,
 * quick to enter, enough to answer "is Block 1 working?".
 *
 * Body weight is deliberately directionless: doc 10 forbids guilt, and
 * a returning trainee rebuilding muscle should not be told the number
 * went the "wrong" way. Waist carries the leanness signal instead.
 */

export const METRIC_KINDS = [
  "body_weight",
  "waist",
  "pullup_max",
  "weighted_pullup",
  "dip_max",
  "weighted_dip",
  "dead_hang",
  "resting_hr",
  "mobility_score",
] as const;
export type MetricKind = (typeof METRIC_KINDS)[number];

export type MetricDirection = "up" | "down" | "neutral";

export interface MetricSpec {
  kind: MetricKind;
  label: string;
  unit: string;
  /** Which way counts as progress; "neutral" is tracked without judgement. */
  direction: MetricDirection;
  /** Sanity bounds — catches a slipped decimal, not a strict rule. */
  min: number;
  max: number;
  step: number;
  hint?: string;
}

export const METRIC_SPECS: Record<MetricKind, MetricSpec> = {
  body_weight: {
    kind: "body_weight",
    label: "Body weight",
    unit: "kg",
    direction: "neutral",
    min: 30,
    max: 250,
    step: 0.1,
    hint: "Same time of day is more useful than every day.",
  },
  waist: {
    kind: "waist",
    label: "Waist",
    unit: "cm",
    direction: "down",
    min: 50,
    max: 200,
    step: 0.5,
    hint: "Measured at the navel, relaxed.",
  },
  pullup_max: {
    kind: "pullup_max",
    label: "Pull-up max",
    unit: "reps",
    direction: "up",
    min: 0,
    max: 60,
    step: 1,
    hint: "Strict reps, one set, stopping short of failure.",
  },
  weighted_pullup: {
    kind: "weighted_pullup",
    label: "Weighted pull-up",
    unit: "kg added",
    direction: "up",
    min: 0,
    max: 100,
    step: 1.25,
    hint: "Heaviest clean single or triple.",
  },
  dip_max: {
    kind: "dip_max",
    label: "Dip max",
    unit: "reps",
    direction: "up",
    min: 0,
    max: 80,
    step: 1,
  },
  weighted_dip: {
    kind: "weighted_dip",
    label: "Weighted dip",
    unit: "kg added",
    direction: "up",
    min: 0,
    max: 100,
    step: 1.25,
  },
  dead_hang: {
    kind: "dead_hang",
    label: "Dead hang",
    unit: "seconds",
    direction: "up",
    min: 0,
    max: 600,
    step: 1,
  },
  resting_hr: {
    kind: "resting_hr",
    label: "Resting heart rate",
    unit: "bpm",
    direction: "down",
    min: 30,
    max: 140,
    step: 1,
    hint: "First thing, before getting up.",
  },
  mobility_score: {
    kind: "mobility_score",
    label: "Mobility score",
    unit: "/10",
    direction: "up",
    min: 0,
    max: 10,
    step: 1,
    hint: "From the five-test check — monthly is plenty.",
  },
};

export function isMetricKind(value: string): value is MetricKind {
  return (METRIC_KINDS as readonly string[]).includes(value);
}

/** Rejects values a slipped decimal would produce. */
export function validateMetric(kind: MetricKind, value: number): string | null {
  const spec = METRIC_SPECS[kind];
  if (!Number.isFinite(value)) return "That doesn't look like a number.";
  if (value < spec.min || value > spec.max) {
    return `${spec.label} is usually between ${spec.min} and ${spec.max} ${spec.unit}.`;
  }
  return null;
}

export interface MetricPoint {
  date: string;
  value: number;
}

export interface MetricTrend {
  kind: MetricKind;
  latest: MetricPoint;
  first: MetricPoint;
  /** latest − first; null when there's only one reading. */
  change: number | null;
  /** True when movement matches the metric's direction of progress. */
  improving: boolean | null;
}

/** `points` must be sorted oldest first. */
export function summariseTrend(
  kind: MetricKind,
  points: MetricPoint[],
): MetricTrend | null {
  if (points.length === 0) return null;
  const first = points[0];
  const latest = points[points.length - 1];
  if (points.length === 1) {
    return { kind, latest, first, change: null, improving: null };
  }
  const change = Number((latest.value - first.value).toFixed(2));
  const direction = METRIC_SPECS[kind].direction;
  const improving =
    direction === "neutral" || change === 0
      ? null
      : direction === "up"
        ? change > 0
        : change < 0;
  return { kind, latest, first, change, improving };
}

/**
 * The five-test mobility check (decision D14) — one test per doc-11
 * focus area, each scored 0/1/2 for a total out of 10. Roughly five
 * minutes, monthly.
 */
export interface MobilityTest {
  id: string;
  area: string;
  instruction: string;
  /** Index is the score: options[0] = 0 points, options[2] = 2 points. */
  options: [string, string, string];
}

export const MOBILITY_TESTS: MobilityTest[] = [
  {
    id: "wrists",
    area: "Wrists",
    instruction:
      "Kneel with palms flat on the floor, fingers forward. Shift your weight forward until the forearm is vertical.",
    options: [
      "Can't bear weight on flat palms",
      "Partial range, or it aches",
      "Comfortable for 10 seconds, both sides",
    ],
  },
  {
    id: "shoulders",
    area: "Shoulders",
    instruction:
      "Stand with your back flat to a wall, ribs down. Slide straight arms overhead to touch the wall.",
    options: [
      "Hands can't reach the wall",
      "Touch, but the back arches or elbows bend",
      "Touch with ribs down and elbows straight",
    ],
  },
  {
    id: "thoracic",
    area: "Thoracic spine",
    instruction:
      "Sit tall with arms crossed and hips square. Rotate as far as you can each way.",
    options: ["Under 30°", "Roughly 30–45°", "45° or more, both sides"],
  },
  {
    id: "hips",
    area: "Hips",
    instruction: "Hold a deep squat with heels down for 30 seconds.",
    options: [
      "Can't reach depth",
      "Reach depth but strained, or heels lift",
      "Full depth, heels down, relaxed",
    ],
  },
  {
    id: "ankles",
    area: "Ankles",
    instruction:
      "Knee-to-wall: big toe about 10 cm from the wall, drive the knee forward keeping the heel down.",
    options: [
      "Neither side touches",
      "One side touches, or only from closer in",
      "Both sides touch with the heel down",
    ],
  },
];

export const MOBILITY_MAX_SCORE = MOBILITY_TESTS.length * 2;

/** Total score plus the per-test breakdown stored alongside it. */
export function scoreMobility(scores: Record<string, number>): {
  total: number;
  breakdown: string;
} {
  let total = 0;
  const parts: string[] = [];
  for (const test of MOBILITY_TESTS) {
    const raw = scores[test.id];
    const score = Number.isFinite(raw) ? Math.min(Math.max(raw, 0), 2) : 0;
    total += score;
    parts.push(`${test.area} ${score}/2`);
  }
  return { total, breakdown: parts.join(", ") };
}
