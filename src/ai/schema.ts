import { z } from "zod";

/**
 * Candidate-constrained selection (Phase 2 design §3, decision D11):
 * the model chooses exercises by library id from the pre-filtered
 * candidates it was given. Ids outside that set are rejected before
 * anything is written, so an unsafe session cannot be produced.
 */
export const SelectedExercise = z.object({
  exerciseId: z
    .string()
    .describe("Library id, copied exactly from the candidates offered"),
  targetSets: z.number().int(),
  targetReps: z
    .string()
    .describe('Rep target, e.g. "6-10", "30s hold", "30m"'),
  targetWeightKg: z
    .number()
    .nullable()
    .describe("Null for bodyweight, assisted, or time-based work"),
  inShortVersion: z
    .boolean()
    .describe("True for the ~3 exercises forming the 30-minute variant"),
  note: z
    .string()
    .nullable()
    .describe("Short execution cue or caution, else null"),
});

export const GeneratedSession = z.object({
  title: z.string().describe("Short session name, e.g. 'Upper Strength (Pull)'"),
  focus: z.string(),
  rationale: z
    .string()
    .describe("One calm sentence: why this session, why today"),
  durationMinutes: z.number().int(),
  exercises: z.array(SelectedExercise),
  // Food belongs to Fuel (Phase 3) — the session decides training
  // and nothing else.
});

export type GeneratedSessionPlan = z.infer<typeof GeneratedSession>;
