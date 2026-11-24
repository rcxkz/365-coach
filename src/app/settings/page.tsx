import Link from "next/link";
import { MakerStamp } from "@/components/maker-stamp";
import { inAppPasscode } from "@/lib/auth";
import { isDemo } from "@/lib/demo";
import { ArrowLeft } from "lucide-react";
import {
  changePasscode,
  addCoachNote,
  bringBackExercise,
  bringBackMeal,
  forgetCoachNote,
  saveCoachNote,
} from "./actions";
import { ReminderToggle } from "@/components/reminder-toggle";
import { Button } from "@/components/ui/button";
import { listRuledOutExercises } from "@/data/repos/exercises";
import { listRuledOutMeals } from "@/data/repos/fuel";
import { listMemories } from "@/data/repos/memories";
import { getProfile } from "@/data/repos/profile";
import { setupSummary } from "../setup/options";
import { vapidPublicKey } from "@/services/push";

export const dynamic = "force-dynamic";

export const metadata = { title: "Settings" };

const NOTICES: Record<string, string> = {
  coach: "Saved — the next plan uses it.",
  forgot: "Forgotten. It won't shape another plan.",
  back: "Back in the mix.",
};

const textarea =
  "min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

function SetupGroup({
  title,
  href,
  rows,
}: {
  title: string;
  href: string;
  rows: { label: string; value: string }[];
}) {
  return (
    <div className="border-b border-dotted border-border py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">{title}</p>
        <Link href={href} className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          Change
        </Link>
      </div>
      <div className="mt-1 text-sm">
        {rows.map((row) =>
          row.label ? (
            <p key={row.label} className="flex gap-2">
              <span className="w-32 shrink-0 text-muted-foreground">{row.label}</span>
              <span>{row.value}</span>
            </p>
          ) : (
            <p key={row.value} className="text-muted-foreground">
              {row.value}
            </p>
          ),
        )}
      </div>
    </div>
  );
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; passcode?: string }>;
}) {
  const { saved, passcode } = await searchParams;
  const passcodeNotice =
    passcode === "changed"
      ? "Changed. Other devices will need the new passcode."
      : passcode === "wrong"
        ? "That isn't the current passcode. Nothing changed."
        : passcode && passcode !== "env"
          ? passcode
          : null;
  const publicKey = vapidPublicKey();
  // The morning job only runs where Vercel can authenticate it.
  const morningJobOn = Boolean(process.env.CRON_SECRET?.trim());
  const [notes, exercises, meals, { profile }] = await Promise.all([
    listMemories({ domain: "fitness", status: "active" }),
    listRuledOutExercises(),
    listRuledOutMeals(),
    getProfile(),
  ]);
  const summary = setupSummary(profile);

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-8">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Today
      </Link>
      <header className="mt-4 mb-6">
        <h1 className="text-[1.75rem] font-normal leading-none">
          Settings
        </h1>
      </header>

      {/* Your setup: every answer in view, each group one tap from changing. */}
      <section aria-labelledby="your-setup" className="mb-6 border-t border-border pt-4">
        <h2 id="your-setup" className="eyebrow mb-3">
          Your setup
        </h2>
        <SetupGroup title="Parts switched on" href="/setup#parts" rows={[{ label: "", value: summary.parts }]} />
        {profile.modules.train && <SetupGroup title="Training" href="/setup#training" rows={summary.training} />}
        {profile.modules.fuel && <SetupGroup title="Food" href="/setup#food" rows={summary.food} />}
        {profile.modules.journal && (
          <SetupGroup
            title="How I feel"
            href="/journal/trackers"
            rows={[{ label: "", value: "Choose which questions the journal asks, and add your own trackers." }]}
          />
        )}
        <Link
          href="/setup?fresh=1"
          className="mt-3 inline-flex min-h-11 items-center border border-input px-4 text-sm hover:border-foreground/60"
        >
          Redo setup from scratch
        </Link>
        <p className="mt-2 text-xs text-muted-foreground">
          Starts the questions again with nothing chosen. Your history, meals and journal stay.
        </p>
      </section>

      {saved && NOTICES[saved] && (
        <p className="mb-6 rounded-lg bg-secondary p-3 text-sm">{NOTICES[saved]}</p>
      )}

      <section className="border-t border-border py-4">
        <h2 className="eyebrow mb-1">Morning planning and reminder</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Each morning the day gets planned before you wake, and one notification between 7
          and 8am says what&apos;s on. Nothing on days you&apos;re paused, and never more than one.
        </p>
        {!morningJobOn ? (
          <p className="text-sm text-muted-foreground">
            Off on this deployment, so today plans when you tap &ldquo;Plan today&rdquo;. To switch
            it on, add CRON_SECRET in Vercel (Settings → Environment Variables; any long random
            text) and redeploy. The README has the details.
          </p>
        ) : publicKey ? (
          <ReminderToggle publicKey={publicKey} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Morning planning is on. The notification needs two more keys (VAPID) in the
            environment; the README shows how to make them.
          </p>
        )}
      </section>

      <section className="border-t border-border py-4">
        <h2 className="eyebrow mb-1">What the coach knows</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Read before every training plan. Correct anything that&apos;s
          out of date — old bests, an injury that&apos;s healed, a
          preference that changed.
        </p>
        <ul className="flex flex-col gap-3">
          {notes.map((note) => (
            <li key={note.id}>
              <details className="group rounded-lg border p-3">
                <summary className="cursor-pointer list-none text-sm leading-relaxed">
                  {note.content}
                  <span className="ml-1 text-xs text-muted-foreground group-open:hidden">
                    Edit
                  </span>
                </summary>
                <form className="mt-3 flex flex-col gap-2">
                  <textarea
                    name="content"
                    defaultValue={note.content}
                    maxLength={600}
                    className={textarea}
                  />
                  <div className="flex gap-2">
                    <Button
                      formAction={saveCoachNote.bind(null, note.id)}
                      size="sm"
                      type="submit"
                    >
                      Save
                    </Button>
                    <Button
                      formAction={forgetCoachNote.bind(null, note.id)}
                      size="sm"
                      variant="outline"
                      type="submit"
                    >
                      Forget this
                    </Button>
                  </div>
                </form>
              </details>
            </li>
          ))}
        </ul>
        <form action={addCoachNote} className="mt-3 flex flex-col gap-2">
          <textarea
            name="content"
            maxLength={600}
            placeholder="Something it should know, e.g. “Left knee doesn't like deep lunges.”"
            className={textarea}
          />
          <Button size="sm" variant="outline" type="submit" className="self-start">
            Add
          </Button>
        </form>
      </section>

      <section className="border-t border-border py-4">
        <h2 className="eyebrow mb-1">Ruled out</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Exercises you marked &ldquo;not for me&rdquo; and meals marked
          &ldquo;not again&rdquo;. Neither gets suggested until you bring
          it back.
        </p>
        {exercises.length === 0 && meals.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing ruled out.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border border-y border-border">
            {exercises.map((exercise) => (
              <li key={exercise.id} className="flex items-center justify-between py-2.5">
                <span className="text-sm">
                  {exercise.name}
                  <span className="ml-2 text-xs text-muted-foreground">exercise</span>
                </span>
                <form>
                  <Button
                    formAction={bringBackExercise.bind(null, exercise.id)}
                    size="sm"
                    variant="ghost"
                    type="submit"
                  >
                    Bring back
                  </Button>
                </form>
              </li>
            ))}
            {meals.map((meal) => (
              <li key={meal.id} className="flex items-center justify-between py-2.5">
                <span className="text-sm">
                  {meal.name}
                  <span className="ml-2 text-xs text-muted-foreground">meal</span>
                </span>
                <form>
                  <Button
                    formAction={bringBackMeal.bind(null, meal.id)}
                    size="sm"
                    variant="ghost"
                    type="submit"
                  >
                    Bring back
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section id="passcode" className="border-t border-border py-4">
        <h2 className="eyebrow mb-1">Passcode</h2>
        {inAppPasscode() ? (
          <>
            <p className="mb-3 text-sm text-muted-foreground">
              Changing it signs every other device out, which is the way to lock out a lost phone.
            </p>
            {passcodeNotice && <p role="status" className="mb-3 text-sm">{passcodeNotice}</p>}
            <form action={changePasscode} className="flex flex-col gap-2">
              <input type="password" name="current" required autoComplete="current-password" aria-label="Current passcode" placeholder="Current passcode" className="h-11 border border-input bg-background px-3 text-sm" />
              <input type="password" name="passcode" required minLength={8} autoComplete="new-password" aria-label="New passcode" placeholder="New passcode" className="h-11 border border-input bg-background px-3 text-sm" />
              <input type="password" name="confirm" required minLength={8} autoComplete="new-password" aria-label="New passcode again" placeholder="New passcode again" className="h-11 border border-input bg-background px-3 text-sm" />
              <Button type="submit" variant="outline" className="self-start">Change passcode</Button>
            </form>
          </>
        ) : isDemo() ? (
          <p className="text-sm text-muted-foreground">
            The demo is open to everyone. Your own copy asks you to choose a passcode the first
            time you open it, and you can change it here.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Set by APP_PASSCODE in this deployment&apos;s environment. Change it there and redeploy;
            every device is signed out.
          </p>
        )}
      </section>

      <MakerStamp />
    </main>
  );
}
