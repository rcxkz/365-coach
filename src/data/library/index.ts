import type { ExerciseDefinition } from "../../domain/exercises";
import { ATHLETICISM_EXERCISES } from "./athleticism";
import { CALISTHENICS_EXERCISES } from "./calisthenics";
import { CONDITIONING_EXERCISES } from "./conditioning";
import { MOBILITY_EXERCISES } from "./mobility";
import { PREHAB_EXERCISES } from "./prehab";
import { RESTORATION_EXERCISES } from "./restoration";
import { STRENGTH_EXERCISES } from "./strength";

/**
 * The curated global exercise library (Phase 2 design §1). Edited here,
 * seeded to the database by `db:seed` — data, not prompts. Referential
 * integrity is enforced by library.test.ts.
 */
export const EXERCISE_LIBRARY: ExerciseDefinition[] = [
  ...STRENGTH_EXERCISES,
  ...CALISTHENICS_EXERCISES,
  ...ATHLETICISM_EXERCISES,
  ...CONDITIONING_EXERCISES,
  ...MOBILITY_EXERCISES,
  ...RESTORATION_EXERCISES,
  ...PREHAB_EXERCISES,
];
