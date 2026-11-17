/**
 * Readiness assessment (Phase 2 design §2, playbook doc 12).
 *
 * Pure decision logic between the daily check-in and today's training:
 * deterministic, testable, and available even when AI is not. The
 * check-in vocabularies live here (like the exercise vocab) so the
 * schema enums and UI share one source of truth.
 */

export const CHECKIN_SLEEP = ["poor", "normal", "good"] as const;
export type CheckinSleep = (typeof CHECKIN_SLEEP)[number];

export const CHECKIN_SORENESS = ["none", "mild", "heavy"] as const;
export type CheckinSoreness = (typeof CHECKIN_SORENESS)[number];

/** Mirrors the existing checkin_energy enum; kept as data-free literals here. */
export const CHECKIN_ENERGY = ["low", "normal", "high"] as const;
export type CheckinEnergyLevel = (typeof CHECKIN_ENERGY)[number];

/** Check-in pain entry maps to pain_flags severity (1–5 scale). */
export const PAIN_SEVERITY_BY_LABEL = {
  mild: 2,
  moderate: 3,
  severe: 4,
} as const;
export type PainLabel = keyof typeof PAIN_SEVERITY_BY_LABEL;

export type ReadinessLevel = "green" | "yellow" | "red";

export interface ReadinessCheckin {
  sleep?: CheckinSleep | null;
  energy?: CheckinEnergyLevel | null;
  soreness?: CheckinSoreness | null;
}

export interface PainSignal {
  location: string;
  severity: number;
}

export interface ReadinessAssessment {
  level: ReadinessLevel;
  /** Calm, human-readable factors — shown in the UI and fed to the AI. */
  reasons: string[];
}

/**
 * Doc 12 rules, deterministic:
 * - red    — any active pain severity ≥ 4, or poor sleep AND low energy
 * - yellow — any single flag: poor sleep, low energy, heavy soreness,
 *            or moderate (3) pain
 * - green  — everything else; missing data assumes normal readiness
 *            (doc 12 failure behaviour), though pain flags still count.
 *
 * Mild pain (≤ 2) never changes the level — it is worked around through
 * exercise selection, not by cancelling training.
 */
export function assessReadiness(
  checkin: ReadinessCheckin | null,
  painFlags: PainSignal[],
  /**
   * The latest journal entries (Phase 12). Low energy logged any time
   * counts like low energy at check-in; high stress makes it a lighter
   * day — training stays a release, not another demand.
   */
  feeling?: {
    stress?: "low" | "medium" | "high" | null;
    energy?: CheckinEnergyLevel | null;
    soreness?: CheckinSoreness | null;
  },
): ReadinessAssessment {
  const reasons: string[] = [];
  let level: ReadinessLevel = "green";

  const raise = (to: ReadinessLevel, reason: string) => {
    reasons.push(reason);
    if (to === "red" || (to === "yellow" && level === "green")) {
      level = to === "red" ? "red" : level === "red" ? "red" : "yellow";
    }
  };

  const severePain = painFlags.filter((flag) => flag.severity >= 4);
  for (const flag of severePain) {
    raise(
      "red",
      `Severe ${flag.location.replace(/_/g, " ")} pain — recovery only, and worth getting it looked at.`,
    );
  }

  const sleepPoor = checkin?.sleep === "poor";
  const energyLow = checkin?.energy === "low" || feeling?.energy === "low";

  if (sleepPoor && energyLow) {
    raise("red", "Poor sleep on top of low energy — the battery is flat.");
  } else {
    if (sleepPoor) raise("yellow", "Short on sleep.");
    if (energyLow) raise("yellow", "Energy is low.");
  }

  if (feeling?.stress === "high") {
    raise("yellow", "Stress is running high — lighter keeps training a release.");
  }
  if (checkin?.soreness === "heavy" || feeling?.soreness === "heavy") {
    raise("yellow", "Carrying heavy soreness.");
  }

  for (const flag of painFlags) {
    if (flag.severity === 3) {
      raise(
        "yellow",
        `Moderate ${flag.location.replace(/_/g, " ")} pain to work around.`,
      );
    }
  }

  return { level, reasons };
}
