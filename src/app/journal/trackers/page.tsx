import Link from "next/link";
import { ArrowLeft, X } from "lucide-react";
import { addTracker, removeTracker, saveBuiltInTrackers } from "../actions";
import { Button } from "@/components/ui/button";
import { getProfile } from "@/data/repos/profile";
import { BUILT_IN_TRACKERS, MAX_CUSTOM_TRACKERS, type CustomTracker } from "@/domain/profile";

export const dynamic = "force-dynamic";

export const metadata = { title: "What you track" };

const BUILT_IN_LABELS: Record<(typeof BUILT_IN_TRACKERS)[number], string> = {
  mood: "Mood",
  stress: "Stress",
  energy: "Energy",
  soreness: "Soreness",
  digestion: "Stomach",
};

const KIND_LABELS: Record<CustomTracker["kind"], string> = {
  scale: "1–5 scale",
  yesno: "Yes / no",
  number: "A number",
};

/**
 * Choose what the journal asks (Phase 15): switch the built-ins on or
 * off, and add your own — a 1–5 scale, yes/no, or a number with a unit.
 * The built-ins also shape training and dinner; your own are a record,
 * and the weekly review summarises them.
 */
export default async function TrackersPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; added?: string; problem?: string }>;
}) {
  const { saved, added, problem } = await searchParams;
  const { profile } = await getProfile();
  const notice = saved
    ? "Saved."
    : added
      ? "Added — it's on the journal now."
      : problem
        ? "That one couldn't be added — give it a name that isn't already used."
        : null;

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-8">
      <Link
        href="/journal"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Journal
      </Link>
      <header className="mt-4 mb-6">
        <p className="eyebrow">Journal</p>
        <h1 className="mt-1.5 text-[1.75rem] font-normal leading-none">
          What you track
        </h1>
      </header>

      {notice && <p className="mb-6 rounded-lg bg-secondary p-3 text-sm">{notice}</p>}

      <section className="mb-8">
        <h2 className="eyebrow mb-1">Built in</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          These also shape training and dinner — high stress means a lighter
          session and an easier meal.
        </p>
        <form action={saveBuiltInTrackers} className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {BUILT_IN_TRACKERS.map((key) => (
              <label key={key}>
                <input
                  type="checkbox"
                  name="shown"
                  value={key}
                  defaultChecked={!profile.journal.hidden.includes(key)}
                  className="peer sr-only"
                />
                <span className="inline-flex cursor-pointer items-center rounded-md border border-input bg-background px-3 py-1.5 text-sm transition-colors peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground">
                  {BUILT_IN_LABELS[key]}
                </span>
              </label>
            ))}
          </div>
          <Button type="submit" size="sm" variant="outline" className="self-start">
            Save
          </Button>
        </form>
      </section>

      <section>
        <h2 className="eyebrow mb-1">Your own</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Anything worth noticing — headaches, steps, water, medication. The
          weekly review summarises them.
        </p>
        {profile.journal.custom.length > 0 && (
          <ul className="mb-4 flex flex-col divide-y divide-border border-y border-border">
            {profile.journal.custom.map((tracker) => (
              <li key={tracker.id} className="flex items-center justify-between py-2.5">
                <span className="text-sm">
                  {tracker.label}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {KIND_LABELS[tracker.kind]}
                    {tracker.unit ? ` · ${tracker.unit}` : ""}
                  </span>
                </span>
                <form>
                  <button
                    formAction={removeTracker.bind(null, tracker.id)}
                    type="submit"
                    aria-label={`Stop tracking ${tracker.label}`}
                    className="p-1 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        {profile.journal.custom.length < MAX_CUSTOM_TRACKERS ? (
          <form action={addTracker} className="flex flex-col gap-3 rounded-lg border p-3">
            <input
              name="label"
              required
              maxLength={30}
              placeholder="e.g. Headache, Steps, Water"
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            />
            <div className="flex flex-wrap gap-2">
              {(Object.keys(KIND_LABELS) as CustomTracker["kind"][]).map((kind, index) => (
                <label key={kind}>
                  <input
                    type="radio"
                    name="kind"
                    value={kind}
                    defaultChecked={index === 0}
                    className="peer sr-only"
                  />
                  <span className="inline-flex cursor-pointer items-center rounded-md border border-input bg-background px-3 py-1.5 text-sm transition-colors peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground">
                    {KIND_LABELS[kind]}
                  </span>
                </label>
              ))}
            </div>
            <input
              name="unit"
              maxLength={15}
              placeholder="Unit, for numbers (steps, glasses, hours)"
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            />
            <Button type="submit" size="sm" className="self-start">
              Add
            </Button>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">
            That&apos;s the most it holds — remove one to add another.
          </p>
        )}
      </section>
    </main>
  );
}
