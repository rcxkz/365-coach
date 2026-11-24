import { BEHAVIOURAL_CORE } from "./behavioural-core";
import { getAi, isCreditExhausted } from "./client";
import { GeneratedSession, type GeneratedSessionPlan } from "./schema";
import { buildSessionPrompt, type LastPerformance } from "./session-prompt";
import { fitnessVoice } from "./voices/fitness";
import { EXERCISE_LIBRARY } from "@/data/library";
import { getCheckin } from "@/data/repos/checkins";
import { listRuledOutExercises } from "@/data/repos/exercises";
import { listJournalEntries, toJournalEntry } from "@/data/repos/journal";
import { listMemories } from "@/data/repos/memories";
import { getOpenPause, listPauses } from "@/data/repos/pauses";
import { getProfile } from "@/data/repos/profile";
import { listOpenPainFlags } from "@/data/repos/pain";
import { getFuelDay, getMealDefinition } from "@/data/repos/fuel";
import { getLatestReview } from "@/data/repos/reviews";
import { generateFuelDay } from "./generate-fuel";
import { getDayActions, replaceDayActions } from "@/data/repos/today";
import { mealsEatenOn, mealsMadeOn, weekPreppedOn } from "@/data/repos/week-plan";
import { foodActionsFromPlan } from "@/domain/prep-day";
import {
  createWorkout,
  deleteWorkoutByDate,
  getLastPerformance,
  getRecentRotationKeys,
  getWorkoutByDate,
  listPlannedDates,
  listTrainedDates,
  type NewExercise,
} from "@/data/repos/workouts";
import {
  buildSessionCandidates,
  type SectionCandidates,
} from "@/domain/candidates";
import {
  assessReturn,
  easedLoad,
  RAMP_SESSIONS,
  returnRationale,
  type ReturnState,
} from "@/domain/comeback";
import { composeDay, type DayActionDraft } from "@/domain/compose-day";
import { availableEquipment, weeklyCeilingReached } from "@/domain/profile";
import { currentFeeling, describeFeeling } from "@/domain/journal";
import { addDaysISO, startOfWeekISO, todayInTimeZone } from "@/domain/dates";
import { composeFallbackSession } from "@/domain/fallback-plan";
import { assessReadiness, type ReadinessAssessment } from "@/domain/readiness";
import { pickNextSession } from "@/domain/rotation";
import {
  PLANS,
  TEMPLATES_BY_ID,
  type RotationEntry,
  type SessionTemplate,
} from "@/domain/templates";

const LIBRARY_BY_ID = new Map(EXERCISE_LIBRARY.map((e) => [e.id, e]));

const PROGRESSION_LABEL: Record<string, string> = {
  progress: "step up",
  hold: "repeat the same load",
  ease: "ease off",
};

export type GenerateDayResult =
  | { ok: true; title: string; mode: "ai" }
  /** Training is paused (unwell or a break): food only. */
  | { ok: true; title: string; mode: "paused" }
  /** Training is switched off in the user's setup (Phase 15). */
  | { ok: true; title: string; mode: "food_only" }
  /** This week already holds the user's days-per-week (a ceiling). */
  | { ok: true; title: string; mode: "rest_day" }
  | {
      ok: true;
      title: string;
      mode: "fallback";
      /** Why AI didn't plan it — drives honest copy, not blame. */
      fallbackReason:
        | "not_configured"
        | "needs_credit"
        | "ai_unavailable"
        | "recovery_day";
    }
  | { ok: false; reason: "error" };

/**
 * Durable-artifact generation (design D2): plans are written to the
 * database; the UI only ever reads the database.
 *
 * The rotation and the deterministic gates decide *what is allowed*;
 * the AI decides *which of those* and how much (decision D11). When AI
 * is unavailable — no credential, rate limit from the shared Max plan,
 * refusal, malformed output — the same candidates are composed
 * rules-only, so the morning is never empty (doc 12).
 */
export async function generateDay(
  targetDate: string,
): Promise<GenerateDayResult> {
  try {
    const [pause, { profile }] = await Promise.all([getOpenPause(), getProfile()]);
    if (pause) {
      await writePausedDay(targetDate);
      return { ok: true, title: "Rest", mode: "paused" };
    }
    if (!profile.modules.train) {
      await writePausedDay(targetDate);
      return { ok: true, title: "Food only", mode: "food_only" };
    }
    if (
      weeklyCeilingReached(
        await sessionsCountedThisWeek(targetDate),
        startOfWeekISO(targetDate),
        targetDate,
        profile.training.daysPerWeek,
      )
    ) {
      await writePausedDay(targetDate);
      return { ok: true, title: "Rest day", mode: "rest_day" };
    }

    const plan = await buildPlanInputs(targetDate);

    // Red days are not negotiable: recovery, rules-only, no AI call.
    let fallbackReason: Extract<
      GenerateDayResult,
      { mode: "fallback" }
    >["fallbackReason"] = "recovery_day";
    if (plan.readiness.level !== "red") {
      fallbackReason = getAi() ? "ai_unavailable" : "not_configured";
      try {
        const title = await tryAiSession(targetDate, plan);
        if (title) return { ok: true, title, mode: "ai" };
      } catch (error) {
        console.error("generateDay: AI path failed, using rotation", error);
        if (isCreditExhausted(error)) fallbackReason = "needs_credit";
      }
    }

    const title = await writeRulesOnlyPlan(targetDate, plan);
    return { ok: true, title, mode: "fallback", fallbackReason };
  } catch (error) {
    console.error("generateDay failed", error);
    return { ok: false, reason: "error" };
  }
}

/**
 * The week's sessions before `targetDate`: days already trained, plus,
 * when planning ahead, sessions still planned from today on. A planned
 * day in the past that wasn't trained doesn't count — nothing is owed.
 */
async function sessionsCountedThisWeek(targetDate: string): Promise<string[]> {
  const trained = await listTrainedDates(targetDate);
  const today = todayInTimeZone();
  if (targetDate <= today) return trained;
  const weekStart = startOfWeekISO(targetDate);
  const planned = await listPlannedDates(weekStart > today ? weekStart : today, targetDate);
  return [...new Set([...trained, ...planned])];
}

interface PlanInputs {
  entry: RotationEntry;
  template: SessionTemplate;
  sections: SectionCandidates[];
  readiness: ReadinessAssessment;
  memories: string[];
  openPain: string[];
  recentSessions: string[];
  lastPerformance: LastPerformance;
  progressionCalls: string[];
  comeback: Extract<ReturnState, { kind: "returning" }> | null;
  /** Heaviest load in each exercise's last session, by library id. */
  lastTopKg: Map<string, number>;
  /** From the user's setup (Phase 15). */
  sessionMinutes: number;
}

/** Everything both paths need: rotation slot, gated candidates, context. */
async function buildPlanInputs(targetDate: string): Promise<PlanInputs> {
  const [checkin, painFlags, recentKeys, memories, trainedDates, pauses, ruledOut, journal, setup] =
    await Promise.all([
      getCheckin(targetDate),
      listOpenPainFlags(),
      getRecentRotationKeys(targetDate),
      listMemories({ domain: "fitness", status: "active" }),
      listTrainedDates(targetDate),
      listPauses(),
      listRuledOutExercises(),
      listJournalEntries(addDaysISO(targetDate, -1), targetDate),
      getProfile(),
    ]);
  const { profile } = setup;
  const feeling = currentFeeling(journal.map(toJournalEntry), targetDate);
  const returnState = assessReturn({
    today: targetDate,
    trainedDates,
    pauses: pauses.map((pause) => ({
      reason: pause.reason,
      startedOn: pause.startedOn,
      endedOn: pause.endedOn,
    })),
  });
  const comeback = returnState.kind === "returning" ? returnState : null;

  const painSignals = painFlags.map((flag) => ({
    location: flag.location,
    severity: flag.severity,
  }));
  const readiness = assessReadiness(
    checkin
      ? {
          sleep: checkin.sleep,
          energy: checkin.energy,
          soreness: checkin.soreness,
        }
      : null,
    painSignals,
    feeling,
  );
  // The first session back is never a hard one, however good the
  // morning feels: a gentler slot in the rotation, gentler options.
  if (comeback?.session === 1 && readiness.level === "green") {
    readiness.level = "yellow";
  }

  const entry = pickNextSession(PLANS[profile.training.plan].rotation, recentKeys, readiness.level);
  const template = TEMPLATES_BY_ID.get(entry.templateId);
  if (!template) throw new Error(`Unknown template: ${entry.templateId}`);

  const sections = buildSessionCandidates(template, EXERCISE_LIBRARY, {
    painFlags: painSignals,
    readiness: readiness.level,
    excludedExerciseIds: ruledOut.map((exercise) => exercise.id),
    availableEquipment: availableEquipment(profile.training.equipment),
    protectAreas: profile.protect,
  });

  const candidateIds = [
    ...new Set(
      sections.flatMap(({ candidates }) =>
        candidates.map((candidate) => candidate.exercise.id),
      ),
    ),
  ];
  const [performance, recentSessions, lastReview] = await Promise.all([
    getLastPerformance(candidateIds),
    summariseRecentSessions(targetDate),
    getLatestReview(),
  ]);

  // Only carry calls for exercises actually on offer today.
  const candidateIdSet = new Set(candidateIds);
  // Calls made before a gap describe a body that has since had time
  // off; easing back in replaces them until the ramp is done.
  const progressionCalls = (comeback ? [] : (lastReview?.summary.progressions ?? []))
    .filter((call) => candidateIdSet.has(call.libraryExerciseId))
    .map((call) => `${call.name}: ${PROGRESSION_LABEL[call.call]} — ${call.reason}`);

  const lastPerformance: LastPerformance = {};
  const lastTopKg = new Map<string, number>();
  for (const [id, entryPerf] of performance) {
    const top = Math.max(0, ...entryPerf.sets.map((set) => set.weightKg ?? 0));
    if (top > 0) lastTopKg.set(id, top);
    const sets = entryPerf.sets
      .map((set) => `${set.reps}${set.weightKg ? `@${set.weightKg}kg` : ""}`)
      .join(", ");
    lastPerformance[id] = `${entryPerf.date}: ${sets}`;
  }

  return {
    entry,
    template,
    sections,
    readiness,
    // Mood and the like are context for the coach, not rules — they sit
    // with what it knows about the user.
    memories: [
      ...memories.map((memory) => memory.content),
      ...describeFeeling(feeling).map((line) => `Journal today: ${line}`),
    ],
    openPain: painFlags.map(
      (flag) =>
        `${flag.location.replace(/_/g, " ")} (${flag.severity}/5)${flag.aggravatingMovement ? ` — aggravated by ${flag.aggravatingMovement}` : ""}`,
    ),
    recentSessions,
    lastPerformance,
    progressionCalls,
    comeback,
    lastTopKg,
    // Recovery keeps its own, shorter length; everything else is sized
    // to the user's setup.
    sessionMinutes:
      template.sessionType === "recovery"
        ? Math.min(template.targetDurationMinutes, profile.training.sessionMinutes)
        : profile.training.sessionMinutes,
  };
}

/**
 * Prompt guidance for a returning session; the loads and set counts it
 * asks for are also enforced in code (`easeForReturn`).
 */
function comingBackPrompt(
  comeback: NonNullable<PlanInputs["comeback"]>,
): string {
  const why =
    comeback.cause === "unwell"
      ? "after being unwell"
      : `after ${comeback.daysAway} days without training`;
  return `this is session ${comeback.session} of ${RAMP_SESSIONS} back ${why}. Use at most ${comeback.maxSets} sets per exercise and about ${Math.round(comeback.loadFactor * 100)}% of the last loads shown. Leave plenty in reserve — the goal is to finish feeling good and want to come back. Say so warmly in the rationale, without mentioning anything missed.`;
}

/** Caps sets and loads for a returning session (gates in code, D11). */
function easeForReturn(
  exercises: NewExercise[],
  plan: PlanInputs,
): NewExercise[] {
  const comeback = plan.comeback;
  if (!comeback) return exercises;
  return exercises.map((exercise) => {
    const last = exercise.libraryExerciseId
      ? plan.lastTopKg.get(exercise.libraryExerciseId)
      : undefined;
    const ceiling = last ? easedLoad(last, comeback.loadFactor) : null;
    return {
      ...exercise,
      targetSets: Math.min(exercise.targetSets, comeback.maxSets),
      targetWeightKg:
        ceiling !== null && exercise.targetWeightKg != null
          ? Math.min(exercise.targetWeightKg, ceiling)
          : exercise.targetWeightKg,
    };
  });
}

/** Two sets where there would be three: the session is shorter too. */
function returnDuration(plan: PlanInputs, minutes: number): number {
  return plan.comeback?.maxSets === 2 ? Math.round(minutes * 0.7) : minutes;
}

function withReturnNote(plan: PlanInputs, rationale: string): string {
  return plan.comeback ? `${returnRationale(plan.comeback)} ${rationale}` : rationale;
}

async function summariseRecentSessions(targetDate: string): Promise<string[]> {
  const summaries: string[] = [];
  for (let offset = 1; offset <= 10 && summaries.length < 3; offset++) {
    const workout = await getWorkoutByDate(addDaysISO(targetDate, -offset));
    if (!workout) continue;
    const logged = workout.exercises
      .filter((exercise) => exercise.sets.length > 0)
      .map(
        (exercise) =>
          `${exercise.name} ${exercise.sets
            .map((set) => `${set.reps}${set.weightKg ? `@${set.weightKg}kg` : ""}`)
            .join("/")}`,
      )
      .join("; ");
    summaries.push(
      `${workout.date} ${workout.title} (${workout.status})${logged ? `: ${logged}` : " — nothing logged"}`,
    );
  }
  return summaries;
}

/**
 * Keeps only selections that name a real candidate offered for this
 * session — the model cannot smuggle in an exercise the gates excluded.
 */
function validateSelection(
  plan: GeneratedSessionPlan,
  sections: SectionCandidates[],
): NewExercise[] {
  const allowed = new Set(
    sections.flatMap(({ candidates }) =>
      candidates.map((candidate) => candidate.exercise.id),
    ),
  );
  const seen = new Set<string>();
  const exercises: NewExercise[] = [];

  for (const selection of plan.exercises) {
    if (!allowed.has(selection.exerciseId) || seen.has(selection.exerciseId)) {
      continue;
    }
    const def = LIBRARY_BY_ID.get(selection.exerciseId);
    if (!def) continue;
    seen.add(selection.exerciseId);
    exercises.push({
      name: def.name,
      libraryExerciseId: def.id,
      targetSets: Math.min(Math.max(selection.targetSets, 1), 8),
      targetReps: selection.targetReps || def.repsTarget,
      targetWeightKg: selection.targetWeightKg,
      inShortVersion: selection.inShortVersion,
      note: selection.note ?? def.cues,
    });
  }
  return exercises;
}

/** Returns the workout title, or null when AI produced nothing usable. */
async function tryAiSession(
  targetDate: string,
  plan: PlanInputs,
): Promise<string | null> {
  const client = getAi();
  if (!client) return null;

  const prompt = buildSessionPrompt({
    targetDate,
    entry: plan.entry,
    template: plan.template,
    sections: plan.sections,
    memories: plan.memories,
    openPain: plan.openPain,
    readinessReasons: plan.readiness.reasons,
    recentSessions: plan.recentSessions,
    lastPerformance: plan.lastPerformance,
    progressionCalls: plan.progressionCalls,
    comingBack: plan.comeback ? comingBackPrompt(plan.comeback) : undefined,
    sessionMinutes: plan.sessionMinutes,
  });

  const voice = fitnessVoice((await getProfile()).profile);
  const selection = await client.structured({
    label: "generateDay",
    system: `${BEHAVIOURAL_CORE}\n\n${voice}`,
    prompt,
    effort: "medium",
    schema: GeneratedSession,
    name: "session",
  });
  if (!selection) return null;

  const exercises = easeForReturn(
    validateSelection(selection, plan.sections),
    plan,
  );
  // Too thin to be a real session — fall back rather than ship a stub.
  if (exercises.length < 4) return null;

  const rationale = plan.comeback?.session === 1 && !selection.rationale
    ? returnRationale(plan.comeback)
    : selection.rationale;
  const workout = await writeWorkout(targetDate, {
    title: selection.title || plan.entry.label,
    focus: selection.focus || plan.template.purpose,
    rationale,
    returnSession: plan.comeback?.session ?? null,
    durationMinutes: returnDuration(
      plan,
      selection.durationMinutes || plan.sessionMinutes,
    ),
    entry: plan.entry,
    template: plan.template,
    exercises,
  });

  await writeDayActions(targetDate, {
    domain: "fitness",
    kind: "workout",
    title: workout.title,
    rationale,
    workoutId: workout.id,
  });

  return workout.title;
}

/** Rules-only plan from the rotation and the same filtered candidates. */
async function writeRulesOnlyPlan(
  targetDate: string,
  plan: PlanInputs,
): Promise<string> {
  const composed = easeForReturn(
    composeFallbackSession(plan.template, plan.sections),
    plan,
  );
  // A 30-minute setup gets the shortened core the session already marks.
  const short = composed.filter((exercise) => exercise.inShortVersion);
  const exercises = plan.sessionMinutes <= 30 && short.length >= 3 ? short : composed;
  if (exercises.length === 0) {
    throw new Error(`No exercises available for ${plan.template.id}`);
  }

  const rationale = withReturnNote(
    plan,
    plan.readiness.reasons.length > 0
      ? `Next up in your rotation, adjusted for readiness: ${plan.readiness.reasons.join(" ")}`
      : "Next up in your rotation — planned from your block, ready to go.",
  );

  const workout = await writeWorkout(targetDate, {
    title: plan.entry.label,
    focus: plan.template.purpose,
    rationale,
    returnSession: plan.comeback?.session ?? null,
    durationMinutes: returnDuration(plan, plan.sessionMinutes),
    entry: plan.entry,
    template: plan.template,
    exercises,
  });

  await writeDayActions(targetDate, {
    domain: "fitness",
    kind: "workout",
    title: workout.title,
    rationale,
    workoutId: workout.id,
  });

  return workout.title;
}

/**
 * Writes the day's list in two passes.
 *
 * The workout action lands the moment the session exists, so a failure
 * in the fuel call that follows leaves a usable Today rather than a
 * blank one. On 31 July it left a blank one: the workout and the fuel
 * day were written, the day's actions never were, and the cron then
 * skipped every night after because a workout row existed.
 */
async function writeDayActions(
  targetDate: string,
  workout: DayActionDraft | null,
): Promise<void> {
  // A re-plan ("different session", "I'm back" in the evening) changes
  // training, not a dinner already ticked: that stays as it is, rather
  // than being swapped and counted as cooked a second time.
  const ticked = (await getDayActions(targetDate)).filter(
    (action) => action.domain === "fuel" && action.status !== "pending",
  );
  if (ticked.length > 0) {
    await replaceDayActions(
      targetDate,
      composeDay({
        workout,
        foodActions: ticked.map((action) => ({
          domain: "fuel" as const,
          kind: "food" as const,
          title: action.title,
          detail: action.detail,
          rationale: action.rationale,
          mealId: action.mealId,
          status: action.status,
        })),
      }),
    );
    return;
  }

  await replaceDayActions(targetDate, composeDay({ workout }));

  const foodActions = await buildFoodActions(targetDate);
  if (foodActions.length === 0) return;

  await replaceDayActions(targetDate, composeDay({ workout, foodActions }));
}

/**
 * A paused day plans no training. Food still matters — more so when
 * unwell — so dinner stays.
 */
async function writePausedDay(targetDate: string): Promise<void> {
  const existing = await getWorkoutByDate(targetDate);
  const started = existing?.exercises.some((e) => e.sets.length > 0) ?? false;
  if (existing && !started) await deleteWorkoutByDate(targetDate);
  // A session already trained today stays on Today: pausing stops what's
  // next, it doesn't erase what's done.
  const done = started
    ? (await getDayActions(targetDate)).find((action) => action.kind === "workout")
    : undefined;
  await writeDayActions(
    targetDate,
    done
      ? {
          domain: "fitness",
          kind: "workout",
          title: done.title,
          detail: done.detail,
          rationale: done.rationale,
          workoutId: done.workoutId,
          status: done.status,
        }
      : null,
  );
}

/**
 * The day's food actions come from the Fuel system (doc 04), not from
 * the session prompt — one decision, one owner. Fuel failing must not
 * take the training plan with it.
 */
async function buildFoodActions(targetDate: string) {
  try {
    const { profile } = await getProfile();
    if (!profile.modules.fuel) return [];

    // A week planned day by day (Phase 17) sets the day's food: the prep
    // session, and what's eaten, prepped or cooked tonight.
    const [eatenToday, madeToday, prepWeek] = await Promise.all([
      mealsEatenOn(targetDate),
      mealsMadeOn(targetDate),
      weekPreppedOn(targetDate),
    ]);
    if (eatenToday.length > 0 || madeToday.length > 0) {
      const ids = [...new Set([...eatenToday, ...madeToday].map((row) => row.mealId))];
      const defs = await Promise.all(ids.map((id) => getMealDefinition(id)));
      const meals = new Map(
        defs.filter((def): def is NonNullable<typeof def> => Boolean(def)).map((def) => [def.id, def]),
      );
      const planned = foodActionsFromPlan({
        date: targetDate,
        prepOn: prepWeek?.prepOn ?? null,
        madeToday,
        eatenToday,
        meals,
      });
      // Keeps the Fuel screen's "tonight" on the same dinner, and covers
      // a planned day with no dinner of its own.
      const { day } = await generateFuelDay(targetDate);
      if (!eatenToday.some((row) => row.slot === "dinner") && day.dinnerMealId) {
        const dinner = await getMealDefinition(day.dinnerMealId);
        if (dinner) {
          planned.push({
            domain: "fuel",
            kind: "food",
            title: `Dinner: ${dinner.name}`,
            detail: `${dinner.activeMinutes} min hands-on · ${dinner.totalMinutes} min total`,
            rationale: day.dinnerReason,
            mealId: dinner.id,
          });
        }
      }
      return planned;
    }

    const { day } = await generateFuelDay(targetDate);
    const existing = await getFuelDay(targetDate);
    const meal = day.dinnerMealId
      ? await getMealDefinition(day.dinnerMealId)
      : null;

    const actions: DayActionDraft[] = [];
    if (meal) {
      actions.push({
        domain: "fuel",
        kind: "food",
        title: `Dinner: ${meal.name}`,
        detail: `${meal.activeMinutes} min hands-on · ${meal.totalMinutes} min total`,
        rationale: day.dinnerReason,
        mealId: meal.id,
      });
    }
    if (!existing?.lunchSorted && meal?.batchFriendly) {
      actions.push({
        domain: "fuel",
        kind: "food",
        title: "Make an extra portion for tomorrow's lunch",
        detail: "Straight into a container while you plate up",
        rationale: "A lunch that already exists is the best delivery defence.",
      });
    }
    return actions;
  } catch (error) {
    console.error("buildFoodActions failed", error);
    return [];
  }
}

async function writeWorkout(
  targetDate: string,
  input: {
    title: string;
    focus: string;
    rationale: string;
    returnSession: number | null;
    durationMinutes: number;
    entry: RotationEntry;
    template: SessionTemplate;
    exercises: NewExercise[];
  },
) {
  await deleteWorkoutByDate(targetDate);
  return createWorkout({
    date: targetDate,
    title: input.title,
    focus: input.focus,
    rationale: input.rationale,
    returnSession: input.returnSession,
    durationMinutes: input.durationMinutes,
    rotationKey: input.entry.key,
    templateId: input.template.id,
    exercises: input.exercises,
  });
}
