/**
 * Exercise library vocabulary and types (Phase 2 design §1).
 *
 * The controlled vocabularies live here — pure TypeScript — so both the
 * data layer (schema enums, repo validation) and future domain logic
 * (candidate filtering, readiness gates) share one source of truth.
 */

export const EXERCISE_CATEGORIES = [
  "strength",
  "calisthenics",
  "athleticism",
  "conditioning",
  "mobility",
  "restoration",
  "prehab",
] as const;
export type ExerciseCategory = (typeof EXERCISE_CATEGORIES)[number];

/**
 * Primary movement pattern. Accessories that fit no pattern cleanly
 * (calf/tibialis work, hanging core) use the nearest fit — selection
 * keys on `placements` for those, not the pattern.
 */
export const MOVEMENT_PATTERNS = [
  "vertical_pull",
  "vertical_push",
  "horizontal_pull",
  "horizontal_push",
  "squat",
  "hinge",
  "lunge",
  "carry",
  "rotation",
  "anti_rotation",
  "jump",
  "sprint",
  "isometric",
  "locomotion",
  "mobility",
] as const;
export type MovementPattern = (typeof MOVEMENT_PATTERNS)[number];

export const BODY_REGIONS = ["upper", "lower", "full", "core"] as const;
export type BodyRegion = (typeof BODY_REGIONS)[number];

/** Shared with pain_flags.location for new writes (Phase 2 design §1). */
export const BODY_AREAS = [
  "shoulder",
  "elbow",
  "wrist",
  "neck",
  "upper_back",
  "lower_back",
  "hip",
  "knee",
  "ankle",
  "hamstring",
  "groin",
] as const;
export type BodyArea = (typeof BODY_AREAS)[number];

export const EQUIPMENT = [
  "bodyweight",
  "pull_up_bar",
  "dip_station",
  "rings",
  "barbell",
  "trap_bar",
  "landmine",
  "dumbbell",
  "kettlebell",
  "cable",
  "machine",
  "bench",
  "box",
  "band",
  "dip_belt",
  "plate",
  "med_ball",
  "sled",
  "cones",
  "foam_roller",
  "strap",
  "jump_rope",
  "cardio_machine",
  "sauna",
  "steam_room",
  "ice_bath",
  "pool",
  "football_pitch",
] as const;
export type Equipment = (typeof EQUIPMENT)[number];

export const GOALS = [
  "muscle_up",
  "front_lever",
  "handstand",
  "football",
  "general_strength",
  "fat_loss",
  "joint_resilience",
  "posture",
  "mobility",
] as const;
export type Goal = (typeof GOALS)[number];

export const EXERCISE_ATTRIBUTES = [
  "pulling",
  "pushing",
  "grip",
  "core",
  "explosiveness",
  "engine",
  "balance",
  "coordination",
] as const;
export type ExerciseAttribute = (typeof EXERCISE_ATTRIBUTES)[number];

export const PLACEMENTS = [
  "warm_up",
  "activation",
  "skill",
  "primary",
  "secondary",
  "accessory",
  "conditioning",
  "core",
  "cooldown",
  "restoration",
] as const;
export type Placement = (typeof PLACEMENTS)[number];

/**
 * A global library entry. `difficulty`, `riskLevel` and `recoveryCost`
 * are 1–5. `progressions` (harder), `regressions` (easier) and
 * `substitutions` (equivalent) hold ordered exercise ids; integrity is
 * enforced by the library test, not the database.
 */
export interface ExerciseDefinition {
  id: string;
  name: string;
  aliases?: string[];
  category: ExerciseCategory;
  movementPattern: MovementPattern;
  bodyRegion: BodyRegion;
  equipment: Equipment[];
  attributes?: ExerciseAttribute[];
  goals: Goal[];
  difficulty: number;
  riskLevel: number;
  /** Hard gate: excluded while an active pain flag matches (severity rules live in domain filters). */
  avoidAreas?: BodyArea[];
  /** Soft gate: kept, but surfaced to the AI as a caution. */
  cautionAreas?: BodyArea[];
  recoveryCost: number;
  setsMin: number;
  setsMax: number;
  /** Text keeps ranges and holds expressible: "3-6", "30s hold", "10 per side". */
  repsTarget: string;
  restSeconds: number;
  placements: Placement[];
  progressions?: string[];
  regressions?: string[];
  substitutions?: string[];
  /** The 2–3 execution cues that matter most (doc 14). */
  cues: string;
}
