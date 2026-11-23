import Link from "next/link";
import { MakerStamp } from "@/components/maker-stamp";
import { ArrowLeft } from "lucide-react";
import {
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

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const { saved } = await searchParams;
  const publicKey = vapidPublicKey();
  // The morning job only runs where Vercel can authenticate it.
  const morningJobOn = Boolean(process.env.CRON_SECRET?.trim());
  const [notes, exercises, meals] = await Promise.all([
    listMemories({ domain: "fitness", status: "active" }),
    listRuledOutExercises(),
    listRuledOutMeals(),
  ]);

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

      <Link
        href="/setup"
        className="mb-6 flex items-center justify-between gap-3 border-y border-border py-4"
      >
        <span>
          <span className="block text-sm font-medium">Your setup</span>
          <span className="block text-xs text-muted-foreground">
            Training, what to look after, food rules, which parts are on.
          </span>
        </span>
        <span className="text-sm text-muted-foreground">Edit →</span>
      </Link>

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
      <MakerStamp />
    </main>
  );
}
