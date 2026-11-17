import type { MetricKind, MetricTrend } from "./metrics";

/**
 * Block 1 exit criteria (playbook doc 13) evaluated from real data.
 *
 * This is a readiness picture, never a scorecard: statuses are "met",
 * "building" or "no data yet", and nothing here is phrased as a
 * shortfall (doc 10, decision D13). A criterion that isn't met yet
 * simply carries the next useful action.
 */

export type CriterionStatus = "met" | "building" | "unknown";

export interface Block1Criterion {
  id: string;
  label: string;
  status: CriterionStatus;
  detail: string;
}

export interface Block1Inputs {
  trends: Partial<Record<MetricKind, MetricTrend>>;
  /** Completed sessions in the last 14 days. */
  recentSessions: number;
  openPain: { location: string; severity: number }[];
}

export interface Block1Assessment {
  criteria: Block1Criterion[];
  metCount: number;
  total: number;
  ready: boolean;
}

/** Three sessions a week sustained — a ceiling of 5–6 stays a ceiling. */
const CONSISTENT_SESSIONS_PER_FORTNIGHT = 6;
/** Resting HR wobbles day to day; this much drift still counts as steady. */
const RESTING_HR_TOLERANCE = 2;

function area(location: string): string {
  return location.replace(/_/g, " ");
}

function consistency(recentSessions: number): Block1Criterion {
  if (recentSessions >= CONSISTENT_SESSIONS_PER_FORTNIGHT) {
    return {
      id: "consistency",
      label: "Training consistently",
      status: "met",
      detail: `${recentSessions} sessions in the last fortnight — the rhythm is there.`,
    };
  }
  return {
    id: "consistency",
    label: "Training consistently",
    status: recentSessions > 0 ? "building" : "unknown",
    detail:
      recentSessions > 0
        ? `${recentSessions} in the last fortnight. The rhythm builds from here.`
        : "Nothing logged in the last fortnight yet — the next session starts it.",
  };
}

function painFree(openPain: Block1Inputs["openPain"]): Block1Criterion {
  if (openPain.length === 0) {
    return {
      id: "pain",
      label: "Training pain-free",
      status: "met",
      detail: "Nothing flagged right now.",
    };
  }
  const worst = openPain.reduce((a, b) => (b.severity > a.severity ? b : a));
  return {
    id: "pain",
    label: "Training pain-free",
    status: "building",
    detail:
      worst.severity >= 3
        ? `Working around ${area(worst.location)} (${worst.severity}/5) — sessions adapt to it automatically.`
        : `A mild ${area(worst.location)} flag is still open; clear it when it settles.`,
  };
}

function fromTrend(
  id: string,
  label: string,
  trend: MetricTrend | undefined,
  copy: {
    met: (t: MetricTrend) => string;
    building: (t: MetricTrend) => string;
    baseline: (t: MetricTrend) => string;
    missing: string;
  },
  isMet: (t: MetricTrend) => boolean,
): Block1Criterion {
  if (!trend) {
    return { id, label, status: "unknown", detail: copy.missing };
  }
  if (trend.change === null) {
    return { id, label, status: "unknown", detail: copy.baseline(trend) };
  }
  return isMet(trend)
    ? { id, label, status: "met", detail: copy.met(trend) }
    : { id, label, status: "building", detail: copy.building(trend) };
}

export function evaluateBlock1(inputs: Block1Inputs): Block1Assessment {
  const { trends } = inputs;

  const criteria: Block1Criterion[] = [
    consistency(inputs.recentSessions),
    painFree(inputs.openPain),
    fromTrend(
      "mobility",
      "Improved mobility",
      trends.mobility_score,
      {
        met: (t) => `Mobility score at ${t.latest.value}/10.`,
        building: (t) =>
          `Holding at ${t.latest.value}/10 — the daily mobility work moves this.`,
        baseline: (t) =>
          `Baseline ${t.latest.value}/10 recorded. Retest in a month to see the trend.`,
        missing: "Not measured yet — the five-test check takes five minutes.",
      },
      (t) => (t.improving ?? false) || t.latest.value >= 8,
    ),
    upperBodyStrength(trends),
    fromTrend(
      "recovery",
      "Stable recovery",
      trends.resting_hr,
      {
        met: (t) => `Resting heart rate steady around ${t.latest.value} bpm.`,
        building: (t) =>
          `Resting heart rate at ${t.latest.value} bpm, up from ${t.first.value} — often sleep or stress rather than training.`,
        baseline: (t) => `Baseline ${t.latest.value} bpm recorded.`,
        missing: "No resting heart rate recorded yet.",
      },
      (t) => (t.change ?? 0) <= RESTING_HR_TOLERANCE,
    ),
    fromTrend(
      "composition",
      "Leaner body composition",
      trends.waist,
      {
        met: (t) => `Waist down ${Math.abs(t.change ?? 0)} cm to ${t.latest.value} cm.`,
        building: (t) =>
          `Waist at ${t.latest.value} cm — the fuel side moves this more than training does.`,
        baseline: (t) => `Baseline ${t.latest.value} cm recorded.`,
        missing: "No waist measurement recorded yet.",
      },
      (t) => (t.change ?? 0) < 0,
    ),
  ];

  const metCount = criteria.filter((c) => c.status === "met").length;
  return {
    criteria,
    metCount,
    total: criteria.length,
    ready: metCount === criteria.length,
  };
}

/** Doc 13 pairs pull-ups and dips as one criterion. */
function upperBodyStrength(
  trends: Block1Inputs["trends"],
): Block1Criterion {
  const pull = trends.pullup_max;
  const dip = trends.dip_max;
  if (!pull && !dip) {
    return {
      id: "upper_strength",
      label: "Better pull-ups and dips",
      status: "unknown",
      detail: "No maxes recorded yet — one test set of each is enough.",
    };
  }
  const gained = (trend?: MetricTrend) => (trend?.change ?? 0) > 0;
  const parts: string[] = [];
  if (pull) parts.push(`pull-ups ${pull.latest.value}`);
  if (dip) parts.push(`dips ${dip.latest.value}`);
  const summary = parts.join(", ");

  if (pull && dip && gained(pull) && gained(dip)) {
    return {
      id: "upper_strength",
      label: "Better pull-ups and dips",
      status: "met",
      detail: `Both moving: ${summary}.`,
    };
  }
  if (!pull || !dip) {
    return {
      id: "upper_strength",
      label: "Better pull-ups and dips",
      status: "unknown",
      detail: `${summary} recorded — add the other to see the pair.`,
    };
  }
  return {
    id: "upper_strength",
    label: "Better pull-ups and dips",
    status: "building",
    detail: `${summary}. Strength shows up in test sets every few weeks, not weekly.`,
  };
}
