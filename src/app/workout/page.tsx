import Link from "next/link";
import { ArrowLeft, ChevronRight, Clock, RefreshCw } from "lucide-react";
import {
  finishWorkout,
  resolvePainFlagAction,
  restoreFullSession,
  resuggestSession,
  ruleOutExercise,
  shortenSession,
  skipSession,
  unskipSession,
} from "./actions";
import { ExerciseGuide } from "@/components/exercise-guide";
import { PainQuickAdd } from "@/components/pain-quick-add";
import { SetLogger } from "@/components/set-logger";
import { Badge } from "@/components/ui/badge";
import { PendingButton } from "@/components/pending-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { UnitMark } from "@/components/unit-mark";
import { EXERCISE_LIBRARY } from "@/data/library";
import { listOpenPainFlags } from "@/data/repos/pain";
import { getProfile } from "@/data/repos/profile";
import { getWorkoutByDate } from "@/data/repos/workouts";
import { RAMP_SESSIONS } from "@/domain/comeback";
import { todayInTimeZone } from "@/domain/dates";

export const dynamic = "force-dynamic";

/**
 * A button here re-suggests the session with the coach — model calls that take tens of
 * seconds. Server actions inherit the page's limit, and the platform
 * default cut planning off part-way (the nightly cron hit the same
 * thing on 31 July), so the ceiling is stated rather than inherited.
 */
export const maxDuration = 300;

export const metadata = { title: "Workout" };

const LIBRARY_BY_ID = new Map(EXERCISE_LIBRARY.map((exercise) => [exercise.id, exercise]));

const RESUGGEST_NOTICE: Record<string, string> = {
  logged:
    "Sets are already logged for this one, so it stays put — swapping it now would delete them. Shorten it or adjust it from the check-in instead.",
  done: "Different session, same rotation slot. Nothing lost.",
};

export default async function WorkoutPage({
  searchParams,
}: {
  searchParams: Promise<{ resuggest?: string; date?: string; ruledOut?: string }>;
}) {
  const { resuggest, date: dateParam, ruledOut } = await searchParams;
  const today = todayInTimeZone();
  // A past date turns this into the backdating screen — same session,
  // same logger, just not today's.
  const date = dateParam && dateParam < today ? dateParam : today;
  const isPast = date !== today;
  const [workout, painFlags] = await Promise.all([
    getWorkoutByDate(date),
    listOpenPainFlags(),
  ]);

  if (!workout) {
    return (
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-8">
        <BackLink isPast={isPast} />
        <p className="mt-6 text-sm text-muted-foreground">
          {isPast
            ? "Nothing was planned that day, so there's no session to record against it."
            : "No workout planned for today. Rest counts as training too."}
        </p>
      </main>
    );
  }

  const included = workout.exercises.filter((e) => e.included);
  const excluded = workout.exercises.filter((e) => !e.included);
  const shortened = excluded.length > 0;
  const completed = workout.status === "completed";
  const skipped = workout.status === "skipped";
  const totalSetsLogged = workout.exercises.reduce(
    (count, exercise) => count + exercise.sets.length,
    0,
  );
  const targetSetTotal = included.reduce(
    (count, exercise) => count + exercise.targetSets,
    0,
  );

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-8">
      <BackLink isPast={isPast} />

      <header className="mt-4 mb-6">
        <p className="eyebrow">
          {isPast
            ? formatPastDate(date)
            : completed
              ? "Session complete"
              : skipped
                ? "Skipped today"
                : "Today's session"}
        </p>
        <div className="mt-1.5 flex items-center gap-2">
          <h1 className="text-[1.75rem] font-normal leading-none">
            {workout.title}
          </h1>
          {completed && <Badge variant="secondary">Completed</Badge>}
          {workout.returnSession && !completed && (
            <Badge variant="secondary">
              Easing back in · {workout.returnSession} of {RAMP_SESSIONS}
            </Badge>
          )}
        </div>
        <div className="mt-3">
          <UnitMark
            filled={totalSetsLogged}
            total={targetSetTotal}
            tone={totalSetsLogged >= targetSetTotal ? "go" : "neutral"}
            label={`${totalSetsLogged} of ${targetSetTotal} sets logged`}
          />
        </div>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          {shortened
            ? "~30 min · shortened session"
            : `~${workout.durationMinutes ?? 45} min`}
          {workout.focus && <> · {workout.focus}</>}
        </p>
        {workout.rationale && (
          <p className="mt-2 text-sm text-muted-foreground">
            {workout.rationale}
          </p>
        )}
      </header>

      {ruledOut && (
        <p className="mb-6 rounded-lg bg-secondary p-4 text-sm">
          Noted — it won&apos;t be planned again. Changed your mind? It&apos;s
          in Settings.
        </p>
      )}

      {resuggest && RESUGGEST_NOTICE[resuggest] && (
        <p className="mb-6 rounded-lg bg-secondary p-4 text-sm">
          {RESUGGEST_NOTICE[resuggest]}
        </p>
      )}

      {completed && (
        <p className="mb-6 rounded-lg bg-secondary p-4 text-sm">
          {workout.returnSession === 1
            ? `First session back — the hardest one is done. ${totalSetsLogged} sets logged.`
            : `Session banked — ${totalSetsLogged} sets logged.`}
          {shortened && " The shorter version was the right call today."}
        </p>
      )}

      {skipped && (
        <div className="mb-6 rounded-lg bg-secondary p-4">
          <p className="text-sm">
            Not today. This session stays due and will come round again — the
            rotation hasn&apos;t moved past it.
          </p>
          <form className="mt-3">
            <Button
              formAction={unskipSession.bind(null, date)}
              variant="outline"
              size="sm"
              type="submit"
            >
              Actually, I&apos;ll do it
            </Button>
          </form>
        </div>
      )}

      {!completed && workout.notes && (
        <p className="mb-6 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">
            Adjusted for today.{" "}
          </span>
          {workout.notes}
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {included.map((exercise) => (
          <li key={exercise.id}>
            <Card className="py-0">
              <CardContent className="p-4">
                <ExerciseGuide
                  name={exercise.name}
                  libraryExerciseId={exercise.libraryExerciseId}
                  cues={
                    exercise.libraryExerciseId
                      ? (LIBRARY_BY_ID.get(exercise.libraryExerciseId)?.cues ?? null)
                      : null
                  }
                  note={exercise.note}
                />
                <p className="figure mt-0.5 text-xs text-muted-foreground">
                  {exercise.targetSets} × {exercise.targetReps}
                  {exercise.targetWeightKg ? ` · ${exercise.targetWeightKg}kg` : ""}
                </p>
                {exercise.note &&
                  exercise.note.split("\n").map((line, index) =>
                    index === 0 ? (
                      <p key={index} className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                        {line}
                      </p>
                    ) : (
                      // Cautions sit apart from the cue, marked, so they're seen.
                      <p key={index} className="mt-1.5 flex gap-2 text-xs leading-relaxed">
                        <span aria-hidden className="mt-[0.4rem] h-1.5 w-1.5 shrink-0 rounded-full bg-highlight" />
                        {line}
                      </p>
                    ),
                  )}
                <SetLogger
                  exerciseId={exercise.id}
                  targetSets={exercise.targetSets}
                  targetReps={exercise.targetReps}
                  targetWeightKg={exercise.targetWeightKg}
                  sets={exercise.sets}
                  disabled={completed || skipped}
                />
                {exercise.libraryExerciseId &&
                  exercise.sets.length === 0 &&
                  !completed &&
                  !skipped &&
                  !isPast && (
                    <form className="mt-2 text-right">
                      <button
                        formAction={ruleOutExercise.bind(
                          null,
                          exercise.id,
                          exercise.libraryExerciseId,
                        )}
                        type="submit"
                        className="text-xs text-muted-foreground underline-offset-4 hover:underline"
                      >
                        Not for me
                      </button>
                    </form>
                  )}
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>

      {shortened && excluded.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          Not today: {excluded.map((e) => e.name).join(", ")}
        </p>
      )}

      {!completed && !skipped && (
        <div className="mt-6 flex flex-col gap-3">
          <form>
            {shortened ? (
              <Button formAction={restoreFullSession.bind(null, date)} variant="outline" className="w-full" type="submit">
                Do the full session after all
              </Button>
            ) : (
              <Button formAction={shortenSession.bind(null, date)} variant="outline" className="w-full" type="submit">
                Short on time? Do the 30-minute version
              </Button>
            )}
          </form>
          <form>
            <Button formAction={finishWorkout.bind(null, date)} className="w-full" type="submit">
              Finish workout
            </Button>
          </form>

          <div className="flex gap-3">
            {/* Offered only while nothing is logged — swapping the session
                deletes it, so past that point the honest answer is no. */}
            {totalSetsLogged === 0 && (
              <form className="flex-1">
                <PendingButton pendingLabel="Finding another session…"
                  formAction={resuggestSession.bind(null, date)}
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  type="submit"
                >
                  <RefreshCw className="h-4 w-4" />
                  Suggest a different one
                </PendingButton>
              </form>
            )}
            <form className="flex-1">
              <Button
                formAction={skipSession.bind(null, date)}
                variant="ghost"
                size="sm"
                className="w-full"
                type="submit"
              >
                Not today
              </Button>
            </form>
          </div>
          <p className="text-center text-xs text-muted-foreground">
            Skipping doesn&apos;t lose the session — it comes round again.
          </p>
        </div>
      )}

      {!isPast && (
        <Link
          href="/workout/past"
          className="mt-8 flex items-center gap-3 border-y border-border py-4 transition-colors hover:bg-foreground/[0.02]"
        >
          <div className="min-w-0 flex-1">
            <p className="eyebrow">Earlier sessions</p>
            <p className="mt-0.5 font-medium leading-snug">
              Trained and didn&apos;t log it?
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Record a past session in one tap.
            </p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Link>
      )}

      <section className="mt-8">
        <h2 className="eyebrow mb-3">
          Anything hurting?
        </h2>
        {painFlags.length > 0 && (
          <ul className="mb-3 flex flex-col gap-2">
            {painFlags.map((flag) => (
              <li key={flag.id} className="flex items-center justify-between text-sm">
                <span className="capitalize">
                  {flag.location} ({flag.severity}/5)
                  {flag.aggravatingMovement && (
                    <span className="text-muted-foreground"> — {flag.aggravatingMovement}</span>
                  )}
                </span>
                <form>
                  <Button formAction={resolvePainFlagAction.bind(null, flag.id)} variant="ghost" size="sm" type="submit">
                    Feeling fine now
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <PainQuickAdd protect={(await getProfile()).profile.protect} />
      </section>
    </main>
  );
}

function BackLink({ isPast }: { isPast: boolean }) {
  return (
    <Link
      href={isPast ? "/workout/past" : "/"}
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" /> {isPast ? "Earlier sessions" : "Today"}
    </Link>
  );
}

function formatPastDate(date: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${date}T00:00:00Z`));
}
