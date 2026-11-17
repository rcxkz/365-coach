import { asc, eq, inArray, lte, sql } from "drizzle-orm";
import { getDb } from "../db";
import { exerciseUserState, exercises } from "../schema";
import {
  BODY_AREAS,
  EQUIPMENT,
  EXERCISE_ATTRIBUTES,
  GOALS,
  PLACEMENTS,
  type ExerciseDefinition,
} from "../../domain/exercises";

export type ExerciseRow = typeof exercises.$inferSelect;
export type ExerciseUserStateRow = typeof exerciseUserState.$inferSelect;

const VALID_EQUIPMENT = new Set<string>(EQUIPMENT);
const VALID_AREAS = new Set<string>(BODY_AREAS);
const VALID_GOALS = new Set<string>(GOALS);
const VALID_ATTRIBUTES = new Set<string>(EXERCISE_ATTRIBUTES);
const VALID_PLACEMENTS = new Set<string>(PLACEMENTS);

/**
 * The text[] columns are freeform in the database; the vocabulary is
 * enforced here so bad data can't enter through any code path.
 */
function assertVocabulary(def: ExerciseDefinition): void {
  const check = (values: string[], valid: Set<string>, field: string) => {
    for (const value of values) {
      if (!valid.has(value)) {
        throw new Error(`${def.id}: invalid ${field} "${value}"`);
      }
    }
  };
  check(def.equipment, VALID_EQUIPMENT, "equipment");
  check(def.avoidAreas ?? [], VALID_AREAS, "avoidArea");
  check(def.cautionAreas ?? [], VALID_AREAS, "cautionArea");
  check(def.goals, VALID_GOALS, "goal");
  check(def.attributes ?? [], VALID_ATTRIBUTES, "attribute");
  check(def.placements, VALID_PLACEMENTS, "placement");
}

function toRow(def: ExerciseDefinition): typeof exercises.$inferInsert {
  return {
    id: def.id,
    name: def.name,
    aliases: def.aliases ?? [],
    category: def.category,
    movementPattern: def.movementPattern,
    bodyRegion: def.bodyRegion,
    equipment: def.equipment,
    attributes: def.attributes ?? [],
    goals: def.goals,
    difficulty: def.difficulty,
    riskLevel: def.riskLevel,
    avoidAreas: def.avoidAreas ?? [],
    cautionAreas: def.cautionAreas ?? [],
    recoveryCost: def.recoveryCost,
    setsMin: def.setsMin,
    setsMax: def.setsMax,
    repsTarget: def.repsTarget,
    restSeconds: def.restSeconds,
    placements: def.placements,
    progressions: def.progressions ?? [],
    regressions: def.regressions ?? [],
    substitutions: def.substitutions ?? [],
    cues: def.cues,
  };
}

/**
 * Idempotent library sync: inserts new definitions and updates existing
 * ones in place (never deletes, so user state and workout links survive
 * library edits). One statement — safe on neon-http's no-transaction
 * driver.
 */
export async function upsertExercises(
  defs: ExerciseDefinition[],
): Promise<number> {
  if (defs.length === 0) return 0;
  for (const def of defs) assertVocabulary(def);

  const db = await getDb();
  await db
    .insert(exercises)
    .values(defs.map(toRow))
    .onConflictDoUpdate({
      target: exercises.id,
      set: {
        name: sql`excluded.name`,
        aliases: sql`excluded.aliases`,
        category: sql`excluded.category`,
        movementPattern: sql`excluded.movement_pattern`,
        bodyRegion: sql`excluded.body_region`,
        equipment: sql`excluded.equipment`,
        attributes: sql`excluded.attributes`,
        goals: sql`excluded.goals`,
        difficulty: sql`excluded.difficulty`,
        riskLevel: sql`excluded.risk_level`,
        avoidAreas: sql`excluded.avoid_areas`,
        cautionAreas: sql`excluded.caution_areas`,
        recoveryCost: sql`excluded.recovery_cost`,
        setsMin: sql`excluded.sets_min`,
        setsMax: sql`excluded.sets_max`,
        repsTarget: sql`excluded.reps_target`,
        restSeconds: sql`excluded.rest_seconds`,
        placements: sql`excluded.placements`,
        progressions: sql`excluded.progressions`,
        regressions: sql`excluded.regressions`,
        substitutions: sql`excluded.substitutions`,
        cues: sql`excluded.cues`,
      },
    });
  return defs.length;
}

export async function listExercises(): Promise<ExerciseRow[]> {
  const db = await getDb();
  return db.select().from(exercises).orderBy(asc(exercises.id));
}

export async function getExercisesByIds(
  ids: string[],
): Promise<ExerciseRow[]> {
  if (ids.length === 0) return [];
  const db = await getDb();
  return db.select().from(exercises).where(inArray(exercises.id, ids));
}

export async function getExerciseUserStates(
  ids?: string[],
): Promise<ExerciseUserStateRow[]> {
  const db = await getDb();
  if (ids) {
    if (ids.length === 0) return [];
    return db
      .select()
      .from(exerciseUserState)
      .where(inArray(exerciseUserState.exerciseId, ids));
  }
  return db.select().from(exerciseUserState);
}

export async function upsertExerciseUserState(input: {
  exerciseId: string;
  preference?: number;
  lastPerformedAt?: Date | null;
  note?: string | null;
}): Promise<ExerciseUserStateRow> {
  if (
    input.preference !== undefined &&
    (input.preference < -2 || input.preference > 2)
  ) {
    throw new Error(`preference out of range: ${input.preference}`);
  }
  const db = await getDb();
  const [row] = await db
    .insert(exerciseUserState)
    .values({
      exerciseId: input.exerciseId,
      preference: input.preference ?? 0,
      lastPerformedAt: input.lastPerformedAt ?? null,
      note: input.note ?? null,
    })
    .onConflictDoUpdate({
      target: exerciseUserState.exerciseId,
      set: {
        ...(input.preference !== undefined
          ? { preference: input.preference }
          : {}),
        ...(input.lastPerformedAt !== undefined
          ? { lastPerformedAt: input.lastPerformedAt }
          : {}),
        ...(input.note !== undefined ? { note: input.note } : {}),
        updatedAt: new Date(),
      },
    })
    .returning();
  return row;
}

/** Preference at or below this means "never plan it" (−2: "not for me"). */
export const RULED_OUT_PREFERENCE = -2;

export async function listRuledOutExercises(): Promise<
  { id: string; name: string }[]
> {
  const db = await getDb();
  return db
    .select({ id: exercises.id, name: exercises.name })
    .from(exerciseUserState)
    .innerJoin(exercises, eq(exercises.id, exerciseUserState.exerciseId))
    .where(lte(exerciseUserState.preference, RULED_OUT_PREFERENCE))
    .orderBy(exercises.name);
}
