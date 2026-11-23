import type {
  BodyRegion,
  ExerciseCategory,
  MovementPattern,
  Placement,
} from "./exercises";
import type { ReadinessLevel } from "./readiness";

/**
 * Session templates (Phase 2 design §3, playbook doc 18): structure,
 * never exercises. Adding a template is adding a constant — the engine
 * doesn't change. Exercises are drawn per-section from the library by
 * `filterCandidates`.
 */

export const TRAINING_BLOCKS = [
  "rebuild",
  "strength_base",
  "skill_development",
  "athlete",
] as const;
export type TrainingBlock = (typeof TRAINING_BLOCKS)[number];

export type SessionType =
  | "strength"
  | "hybrid"
  | "skill"
  | "athletic"
  | "conditioning"
  | "recovery";

export interface TemplateSection {
  /** Human label, e.g. "Primary Pull" — also shown to the AI. */
  role: string;
  /** Library placements this section draws from. */
  placements: Placement[];
  /** Acceptable movement patterns; empty/omitted = any. */
  patterns?: MovementPattern[];
  categories?: ExerciseCategory[];
  bodyRegions?: BodyRegion[];
  /** Cap for gentle sections (e.g. recovery-day cardio). */
  maxRecoveryCost?: number;
  /** How many exercises this section holds. */
  count: number;
  optional?: boolean;
}

export interface SessionTemplate {
  id: string;
  name: string;
  purpose: string;
  sessionType: SessionType;
  targetDurationMinutes: number;
  /** 1–5, whole-session recovery cost when done as prescribed. */
  recoveryCost: number;
  /** Worst readiness level at which this template is still appropriate. */
  minReadiness: ReadinessLevel;
  blocks: TrainingBlock[];
  sections: TemplateSection[];
}

const READINESS_RANK: Record<ReadinessLevel, number> = {
  red: 0,
  yellow: 1,
  green: 2,
};

/** True when `level` is at or above the template's minimum readiness. */
export function readinessAllows(
  level: ReadinessLevel,
  minReadiness: ReadinessLevel,
): boolean {
  return READINESS_RANK[level] >= READINESS_RANK[minReadiness];
}

export const SESSION_TEMPLATES: SessionTemplate[] = [
  {
    id: "upper_strength",
    name: "Upper Strength",
    purpose:
      "Develop upper-body strength: presses, pulls and a strong trunk.",
    sessionType: "strength",
    targetDurationMinutes: 60,
    recoveryCost: 3,
    minReadiness: "yellow",
    blocks: ["rebuild", "strength_base", "skill_development"],
    sections: [
      { role: "Warm-up", placements: ["warm_up"], count: 2 },
      { role: "Shoulder Activation", placements: ["activation"], count: 1 },
      {
        role: "Primary Pull",
        placements: ["primary"],
        patterns: ["vertical_pull", "horizontal_pull"],
        count: 1,
      },
      {
        role: "Primary Push",
        placements: ["primary"],
        patterns: ["vertical_push", "horizontal_push"],
        count: 1,
      },
      {
        role: "Secondary Pull",
        placements: ["secondary"],
        patterns: ["vertical_pull", "horizontal_pull"],
        count: 1,
      },
      {
        role: "Accessory Push",
        placements: ["secondary", "accessory"],
        patterns: ["vertical_push", "horizontal_push"],
        count: 1,
      },
      { role: "Core", placements: ["core"], count: 1 },
      { role: "Restoration", placements: ["restoration"], count: 1 },
    ],
  },
  {
    id: "lower_strength",
    name: "Lower Strength",
    purpose: "Develop lower-body strength and resilience.",
    sessionType: "strength",
    targetDurationMinutes: 60,
    recoveryCost: 4,
    minReadiness: "yellow",
    blocks: ["rebuild", "strength_base"],
    sections: [
      { role: "Warm-up", placements: ["warm_up"], count: 2 },
      {
        role: "Hip Mobility",
        placements: ["warm_up", "activation"],
        categories: ["mobility"],
        bodyRegions: ["lower", "full"],
        count: 1,
      },
      {
        role: "Primary Squat",
        placements: ["primary"],
        patterns: ["squat"],
        count: 1,
      },
      {
        role: "Hinge",
        placements: ["primary", "secondary"],
        patterns: ["hinge"],
        count: 1,
      },
      {
        role: "Single-Leg Work",
        placements: ["secondary", "accessory"],
        patterns: ["lunge"],
        count: 1,
      },
      {
        role: "Posterior Chain",
        placements: ["secondary", "accessory"],
        patterns: ["hinge"],
        count: 1,
      },
      { role: "Core", placements: ["core"], count: 1 },
      { role: "Restoration", placements: ["restoration"], count: 1 },
    ],
  },
  {
    id: "full_body_hybrid",
    name: "Full Body Hybrid",
    purpose: "Balance strength, athleticism and movement quality.",
    sessionType: "hybrid",
    targetDurationMinutes: 60,
    recoveryCost: 3,
    minReadiness: "yellow",
    blocks: ["rebuild", "strength_base", "athlete"],
    sections: [
      { role: "Warm-up", placements: ["warm_up"], count: 2 },
      { role: "Skill", placements: ["skill"], count: 1, optional: true },
      {
        role: "Upper Compound",
        placements: ["primary"],
        patterns: [
          "vertical_pull",
          "vertical_push",
          "horizontal_pull",
          "horizontal_push",
        ],
        count: 1,
      },
      {
        role: "Lower Compound",
        placements: ["primary"],
        patterns: ["squat", "hinge", "lunge"],
        count: 1,
      },
      {
        role: "Athletic Circuit",
        placements: ["primary", "accessory", "activation"],
        patterns: ["jump", "sprint", "rotation"],
        categories: ["athleticism"],
        count: 2,
      },
      { role: "Conditioning", placements: ["conditioning"], count: 1 },
      { role: "Restoration", placements: ["restoration"], count: 1 },
    ],
  },
  {
    id: "skill_development",
    name: "Skill Development",
    purpose:
      "Prioritise technical progression: muscle-up, front lever, handstand.",
    sessionType: "skill",
    targetDurationMinutes: 60,
    recoveryCost: 2,
    minReadiness: "green",
    blocks: ["rebuild", "skill_development"],
    sections: [
      { role: "Warm-up", placements: ["warm_up"], count: 2 },
      {
        role: "Mobility Prep",
        placements: ["warm_up", "activation"],
        categories: ["mobility"],
        count: 1,
      },
      { role: "Skill Practice", placements: ["skill"], count: 2 },
      {
        role: "Assistance Work",
        placements: ["secondary", "accessory"],
        patterns: [
          "vertical_pull",
          "vertical_push",
          "horizontal_pull",
          "horizontal_push",
        ],
        count: 2,
      },
      { role: "Core", placements: ["core"], count: 1 },
      {
        role: "Conditioning",
        placements: ["conditioning"],
        count: 1,
        optional: true,
      },
      { role: "Restoration", placements: ["restoration"], count: 1 },
    ],
  },
  {
    id: "athletic_development",
    name: "Athletic Development",
    purpose: "Improve speed, power and coordination.",
    sessionType: "athletic",
    targetDurationMinutes: 60,
    recoveryCost: 4,
    minReadiness: "green",
    blocks: ["athlete"],
    sections: [
      { role: "Dynamic Warm-up", placements: ["warm_up"], count: 2 },
      {
        role: "Plyometrics",
        placements: ["primary", "activation"],
        patterns: ["jump"],
        count: 2,
      },
      {
        role: "Sprint Work",
        placements: ["primary", "conditioning"],
        patterns: ["sprint"],
        count: 1,
      },
      {
        role: "Rotational Power",
        placements: ["primary", "accessory", "activation"],
        patterns: ["rotation"],
        count: 1,
      },
      { role: "Conditioning", placements: ["conditioning"], count: 1 },
      { role: "Restoration", placements: ["restoration"], count: 1 },
    ],
  },
  {
    id: "conditioning",
    name: "Conditioning",
    purpose: "Improve cardiovascular fitness while supporting recovery.",
    sessionType: "conditioning",
    targetDurationMinutes: 45,
    recoveryCost: 2,
    minReadiness: "yellow",
    blocks: ["rebuild", "strength_base", "skill_development", "athlete"],
    sections: [
      { role: "Warm-up", placements: ["warm_up"], count: 1 },
      {
        role: "Zone 2",
        placements: ["conditioning"],
        patterns: ["locomotion"],
        count: 1,
      },
      {
        role: "Intervals",
        placements: ["conditioning"],
        count: 1,
        optional: true,
      },
      {
        role: "Mobility",
        placements: ["cooldown"],
        categories: ["mobility"],
        count: 1,
      },
      { role: "Restoration", placements: ["restoration"], count: 1 },
    ],
  },
  {
    id: "recovery",
    name: "Recovery",
    purpose: "Promote recovery without adding fatigue.",
    sessionType: "recovery",
    targetDurationMinutes: 40,
    recoveryCost: 1,
    minReadiness: "red",
    blocks: ["rebuild", "strength_base", "skill_development", "athlete"],
    sections: [
      {
        role: "Mobility",
        placements: ["cooldown", "restoration", "warm_up"],
        categories: ["mobility"],
        maxRecoveryCost: 1,
        count: 3,
      },
      {
        role: "Light Movement",
        placements: ["conditioning"],
        patterns: ["locomotion"],
        maxRecoveryCost: 2,
        count: 1,
      },
      {
        role: "Restoration",
        placements: ["restoration"],
        count: 2,
      },
    ],
  },
];

export const TEMPLATES_BY_ID: ReadonlyMap<string, SessionTemplate> = new Map(
  SESSION_TEMPLATES.map((template) => [template.id, template]),
);

/**
 * Block 1 weekly rotation (doc 13, sessions A–F). Emphasis is a hint
 * for the AI's exercise choices, not a hard constraint.
 */
export interface RotationEntry {
  key: string;
  label: string;
  templateId: string;
  emphasis?: string;
}

export const BLOCK1_ROTATION: RotationEntry[] = [
  {
    key: "A",
    label: "Upper Strength (Pull)",
    templateId: "upper_strength",
    emphasis: "Pull-dominant: lead with the vertical pull work.",
  },
  { key: "B", label: "Lower Strength", templateId: "lower_strength" },
  { key: "C", label: "Recovery + Mobility + Zone 2", templateId: "recovery" },
  {
    key: "D",
    label: "Upper Hybrid (Push)",
    templateId: "upper_strength",
    emphasis: "Push-dominant: lead with the pressing work.",
  },
  {
    key: "E",
    label: "Lower Hybrid + Athleticism",
    templateId: "full_body_hybrid",
    emphasis: "Lower-body and athletic bias: jumps and carries over upper volume.",
  },
  {
    key: "F",
    label: "Skills + Conditioning",
    templateId: "skill_development",
    emphasis: "Include the optional conditioning finisher.",
  },
];

/**
 * Training plans to choose from in setup (Phase 15). Each is a rotation
 * over the same session templates, so every plan gets the same gates —
 * pain, readiness, equipment, protected areas. Keys are prefixed per
 * plan so switching plans starts the new rotation fresh rather than
 * mistaking old history for progress through it. Block 1 keeps its
 * original keys so existing history still counts.
 */
export const PLAN_STYLES = [
  "rebuild",
  "full_body",
  "upper_lower",
  "calisthenics",
  "strength_conditioning",
] as const;
export type PlanStyle = (typeof PLAN_STYLES)[number];

export const PLANS: Record<
  PlanStyle,
  { label: string; description: string; rotation: RotationEntry[] }
> = {
  rebuild: {
    label: "Rebuild",
    description: "Six-session block: strength, hybrid, skills, recovery. Built for coming back.",
    rotation: BLOCK1_ROTATION,
  },
  full_body: {
    label: "Full body",
    description: "Every session trains everything. Simple, and best on 2–3 days a week.",
    rotation: [
      { key: "FB-A", label: "Full Body A", templateId: "full_body_hybrid", emphasis: "Squat and push first." },
      { key: "FB-B", label: "Full Body B", templateId: "full_body_hybrid", emphasis: "Hinge and pull first." },
      { key: "FB-R", label: "Recovery + Mobility", templateId: "recovery" },
    ],
  },
  upper_lower: {
    label: "Upper / lower",
    description: "Alternate upper and lower body. A classic for 4 days a week.",
    rotation: [
      { key: "UL-U1", label: "Upper (Pull)", templateId: "upper_strength", emphasis: "Pull-dominant." },
      { key: "UL-L1", label: "Lower (Squat)", templateId: "lower_strength", emphasis: "Squat-dominant." },
      { key: "UL-U2", label: "Upper (Push)", templateId: "upper_strength", emphasis: "Push-dominant." },
      { key: "UL-L2", label: "Lower (Hinge)", templateId: "lower_strength", emphasis: "Hinge-dominant." },
      { key: "UL-R", label: "Recovery + Mobility", templateId: "recovery" },
    ],
  },
  calisthenics: {
    label: "Calisthenics",
    description: "Bodyweight strength and skills — pull-ups, dips, holds — with legs kept in.",
    rotation: [
      { key: "CA-S", label: "Skills", templateId: "skill_development" },
      { key: "CA-U", label: "Upper Strength", templateId: "upper_strength", emphasis: "Calisthenics-first: bodyweight and weighted bodyweight." },
      { key: "CA-L", label: "Legs + Core", templateId: "lower_strength" },
      { key: "CA-R", label: "Recovery + Mobility", templateId: "recovery" },
    ],
  },
  strength_conditioning: {
    label: "Strength + fitness",
    description: "Strength days with conditioning and athletic work between.",
    rotation: [
      { key: "SC-U", label: "Upper Strength", templateId: "upper_strength" },
      { key: "SC-C", label: "Conditioning", templateId: "conditioning" },
      { key: "SC-L", label: "Lower Strength", templateId: "lower_strength" },
      { key: "SC-A", label: "Athletic", templateId: "athletic_development" },
      { key: "SC-R", label: "Recovery + Mobility", templateId: "recovery" },
    ],
  },
};
