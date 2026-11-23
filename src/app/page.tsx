import Link from "next/link";
import { Sparkles } from "lucide-react";
import { getAnthropic } from "@/ai/client";
import { pauseTraining, planDay, resumeTraining } from "./actions";
import { ActionCard } from "@/components/action-card";
import { CheckinPrompt } from "@/components/checkin-prompt";
import { PendingButton } from "@/components/pending-button";
import { Button } from "@/components/ui/button";
import { UnitMark } from "@/components/unit-mark";
import { getCheckin } from "@/data/repos/checkins";
import { listOpenPainFlags } from "@/data/repos/pain";
import { listJournalEntries, toJournalEntry } from "@/data/repos/journal";
import { getOpenPause } from "@/data/repos/pauses";
import { getProfile } from "@/data/repos/profile";
import { getDayActions } from "@/data/repos/today";
import { getWorkoutByDate } from "@/data/repos/workouts";
import { addDaysISO, todayInTimeZone, USER_TIME_ZONE } from "@/domain/dates";
import { currentFeeling } from "@/domain/journal";

const PLAN_NOTICES: Record<string, string> = {
  error:
    "Planning didn't go through — today's plan is untouched. Worth another try in a bit.",
};

/** Honest, non-blaming reasons the rotation planned instead of the AI. */
const FALLBACK_NOTES: Record<string, string> = {
  not_configured:
    "planned from your rotation. AI coaching isn't connected yet — add an ANTHROPIC_API_KEY to turn it on.",
  needs_credit:
    "planned from your rotation. AI coaching is paused — the Anthropic API account is out of credit.",
  ai_unavailable:
    "planned from your rotation — the AI coach wasn't reachable just now. The session stands on its own.",
  recovery_day:
    "a recovery session, chosen by the rules rather than the coach — that's the call when readiness is low.",
};

export const dynamic = "force-dynamic";

/**
 * A button here plans the day with the coach — model calls that take tens of
 * seconds. Server actions inherit the page's limit, and the platform
 * default cut planning off part-way (the nightly cron hit the same
 * thing on 31 July), so the ceiling is stated rather than inherited.
 */
export const maxDuration = 300;

function formatToday(): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: USER_TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
}

export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{
    plan?: string;
    planned?: string;
    mode?: string;
    why?: string;
    checkin?: string;
    adapted?: string;
    skipped?: string;
    pause?: string;
    resumed?: string;
    setup?: string;
  }>;
}) {
  const {
    plan,
    planned,
    mode,
    why,
    adapted,
    skipped,
    pause: pauseParam,
    resumed,
    setup,
    checkin: checkinParam,
  } = await searchParams;
  const date = todayInTimeZone();
  const [allActions, checkin, workout, painFlags, pause, journal, setupState] = await Promise.all([
    getDayActions(date),
    getCheckin(date),
    getWorkoutByDate(date),
    listOpenPainFlags(),
    getOpenPause(),
    listJournalEntries(addDaysISO(date, -1), date),
    getProfile(),
  ]);
  const { profile, isSetUp } = setupState;
  const feeling = currentFeeling(journal.map(toJournalEntry), date);
  // While paused, training is off the list. Project steps planned
  // before Mission was removed (doc 06) are never shown.
  const actions = allActions.filter(
    (action) =>
      action.kind !== "project" && !(pause && action.kind === "workout"),
  );

  const planTarget = workout ? addDaysISO(date, 1) : date;
  // "with AI" only when there is one — rules-only deployments (and the
  // demo) plan just as well, and shouldn't promise otherwise.
  const planLabel = `${workout ? "Plan tomorrow" : "Plan today"}${getAnthropic() ? " with AI" : ""}`;
  const plannedDay = planned === date ? "Today" : "Tomorrow";
  // `paused` needs no notice: the pause card says it all.
  const notice = setup
    ? "Saved. Every plan from now on follows your setup."
    : resumed
    ? "Welcome back. The first few sessions are lighter on purpose — today's is ready when you are."
    : skipped
    ? "Session skipped. It stays due and comes round again — the rotation hasn't moved past it."
    : adapted
    ? "Today's session is adjusted to how you're feeling — the details are on the workout."
    : plan
    ? PLAN_NOTICES[plan]
    : planned
      ? mode === "paused"
        ? `${plannedDay} is planned around rest — no training while you're paused.`
        : mode === "rest_day"
        ? `${plannedDay} is a rest day — this week already has the training days you asked for.`
        : mode === "food_only"
        ? `${plannedDay} is planned — food only, since training is switched off in your setup.`
        : mode === "fallback"
        ? `${plannedDay} is ${FALLBACK_NOTES[why ?? "ai_unavailable"] ?? FALLBACK_NOTES.ai_unavailable}`
        : `${plannedDay} is planned — it'll be ready when you open the app.`
      : null;

  const doneCount = actions.filter((a) => a.status === "done").length;
  const workoutSummary = workout
    ? `${workout.exercises.length} exercises · ~${workout.durationMinutes ?? 45} min`
    : null;

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-8">
      <header className="mb-7">
        <p className="eyebrow">Today</p>
        <h1 className="mt-1.5 text-[1.75rem] font-normal leading-none">
          {formatToday()}
        </h1>
        {actions.length > 0 && (
          <div className="mt-3 flex items-center gap-2.5">
            <UnitMark
              filled={doneCount}
              total={actions.length}
              tone={doneCount === actions.length ? "go" : "neutral"}
              label={`${doneCount} of ${actions.length} done`}
            />
            <p className="text-xs text-muted-foreground">
              {doneCount === actions.length
                ? "All done — a balanced day, banked."
                : `${doneCount} of ${actions.length}`}
            </p>
          </div>
        )}
      </header>

      {!isSetUp && (
        <Link
          href="/setup"
          className="mb-6 flex items-center justify-between gap-3 rounded-lg border border-foreground/20 p-4"
        >
          <span>
            <span className="block text-sm font-medium">Make it yours</span>
            <span className="block text-xs text-muted-foreground">
              Two minutes of taps: your training, what to look after, how you eat.
            </span>
          </span>
          <span className="text-sm">Set up →</span>
        </Link>
      )}

      <div className="mb-6">
        {pause ? (
          <div className="rounded-lg border p-4">
            <p className="text-sm font-medium">
              {pause.reason === "unwell"
                ? "Training's paused while you get better."
                : "Training's paused — enjoy the break."}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {pause.reason === "unwell"
                ? "Rest, fluids, food. When you're back, the first sessions ease you in."
                : "When you're back, the first sessions ease you in — no catching up."}
            </p>
            <form action={resumeTraining} className="mt-3">
              <PendingButton size="sm" pendingLabel="Planning today's session…">
                {pause.reason === "unwell" ? "I'm feeling better" : "I'm back"}
              </PendingButton>
            </form>
          </div>
        ) : pauseParam === "choose" ? (
          <form
            action={pauseTraining}
            className="flex flex-col gap-3 rounded-lg border p-4"
          >
            <p className="text-sm">
              Pause training? Nothing gets planned until you say you&apos;re
              back, and the first sessions after ease you in.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" name="reason" value="unwell" size="sm">
                I&apos;m unwell
              </Button>
              <Button
                type="submit"
                name="reason"
                value="break"
                size="sm"
                variant="outline"
              >
                Taking a break
              </Button>
              <Link
                href="/"
                className="inline-flex items-center px-2 text-sm text-muted-foreground underline-offset-4 hover:underline"
              >
                Never mind
              </Link>
            </div>
          </form>
        ) : (
          <CheckinPrompt
            checkin={checkin}
            painFlags={painFlags}
            detail={checkinParam === "detail"}
            feeling={feeling}
          />
        )}
      </div>

      {notice && (
        <p className="mb-4 rounded-lg bg-secondary p-3 text-sm">{notice}</p>
      )}

      {actions.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          <p>Nothing planned yet for today.</p>
          {process.env.NODE_ENV === "development" && (
            <p className="mt-2 font-mono text-xs">npm run db:seed</p>
          )}
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-border border-y border-border">
          {actions.map((action) => (
            <li key={action.id}>
              <ActionCard action={action} workoutSummary={workoutSummary} />
            </li>
          ))}
        </ul>
      )}

      <form className="mt-6">
        <PendingButton pendingLabel="Planning… about half a minute"
          formAction={planDay.bind(null, planTarget)}
          variant="outline"
          className="w-full"
          type="submit"
        >
          <Sparkles className="h-4 w-4" />
          {planLabel}
        </PendingButton>
      </form>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
        <Link href="/review" className="underline-offset-4 hover:underline">
          Weekly review
        </Link>
        <Link href="/settings" className="underline-offset-4 hover:underline">
          Settings
        </Link>
      </div>
      {!pause && profile.modules.train && (
        <p className="mt-6 text-center text-xs text-muted-foreground">
          <Link href="/?pause=choose" className="underline-offset-4 hover:underline">
            Unwell, or need a break?
          </Link>
        </p>
      )}
    </main>
  );
}
