import Link from "next/link";
import { X } from "lucide-react";
import { logFeeling, removeFeeling } from "./actions";
import { Button } from "@/components/ui/button";
import { listCheckins, type DailyCheckin } from "@/data/repos/checkins";
import { listJournalEntries, type JournalRow } from "@/data/repos/journal";
import { addDaysISO, todayInTimeZone, USER_TIME_ZONE } from "@/domain/dates";
import type { BuiltInTracker, CustomTracker } from "@/domain/profile";
import { getProfile } from "@/data/repos/profile";

export const dynamic = "force-dynamic";

export const metadata = { title: "Journal" };

const MOOD_LABELS = ["Low", "Meh", "OK", "Good", "Great"];

const NOTICES: Record<string, string> = {
  saved: "Noted.",
  adapted: "Noted — today's session is adjusted to match. The details are on the workout.",
  empty: "Tap at least one thing, then save.",
};

/** How far back the timeline reaches; the weekly review covers the rest. */
const TIMELINE_DAYS = 14;

function Chips({
  name,
  options,
}: {
  name: string;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <label key={option.value}>
          <input type="radio" name={name} value={option.value} className="peer sr-only" />
          <span className="inline-flex cursor-pointer items-center rounded-md border border-input bg-background px-3 py-1.5 text-sm transition-colors peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground">
            {option.label}
          </span>
        </label>
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function describeEntry(entry: JournalRow, trackers: CustomTracker[]): string {
  const parts: string[] = [];
  if (entry.mood !== null) parts.push(`Mood ${MOOD_LABELS[entry.mood - 1].toLowerCase()}`);
  if (entry.stress) parts.push(`stress ${entry.stress}`);
  if (entry.energy) parts.push(`energy ${entry.energy}`);
  if (entry.soreness) parts.push(`soreness ${entry.soreness}`);
  if (entry.digestion) parts.push(`stomach ${entry.digestion}`);
  const custom = (entry.custom ?? {}) as Record<string, number | boolean>;
  for (const tracker of trackers) {
    const value = custom[tracker.id];
    if (value === undefined) continue;
    const label = tracker.label.toLowerCase();
    parts.push(
      tracker.kind === "yesno"
        ? `${label} ${value ? "yes" : "no"}`
        : tracker.kind === "scale"
          ? `${label} ${value}/5`
          : `${label} ${value}${tracker.unit && tracker.unit.toLowerCase() !== label ? ` ${tracker.unit}` : ""}`,
    );
  }
  const text = parts.join(" · ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function describeCheckin(checkin: DailyCheckin): string {
  const parts = [`energy ${checkin.energy}`];
  if (checkin.sleep) parts.unshift(`sleep ${checkin.sleep}`);
  if (checkin.soreness) parts.push(`soreness ${checkin.soreness}`);
  const text = parts.join(" · ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: USER_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatDay(iso: string, today: string): string {
  if (iso === today) return "Today";
  if (iso === addDaysISO(today, -1)) return "Yesterday";
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "short",
  }).format(new Date(`${iso}T12:00:00Z`));
}

/**
 * The "how I feel" journal (Phase 12): tap whatever applies, any time,
 * as often as you like. Zero client JS — native radios and a server
 * action, like the check-in.
 */
export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; adapted?: string; empty?: string }>;
}) {
  const { saved, adapted, empty } = await searchParams;
  const today = todayInTimeZone();
  const from = addDaysISO(today, -(TIMELINE_DAYS - 1));
  const [entries, checkins, { profile }] = await Promise.all([
    listJournalEntries(from, today),
    listCheckins(from, today),
    getProfile(),
  ]);
  const shows = (key: BuiltInTracker) => !profile.journal.hidden.includes(key);
  const trackers = profile.journal.custom;
  const notice = adapted ? NOTICES.adapted : saved ? NOTICES.saved : empty ? NOTICES.empty : null;

  const days = [...new Set([...entries.map((e) => e.date), ...checkins.map((c) => c.date)])]
    .sort()
    .reverse();

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-8">
      <header className="mb-6">
        <p className="eyebrow">Journal</p>
        <h1 className="mt-1.5 text-[1.75rem] font-semibold leading-none tracking-tight">
          How are you feeling?
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Tap whatever applies — any time, as often as you like. It shapes
          training and dinner, and the weekly review looks for patterns.
        </p>
      </header>

      {notice && <p className="mb-6 rounded-lg bg-secondary p-3 text-sm">{notice}</p>}

      <form action={logFeeling} className="mb-8 flex flex-col gap-4 rounded-lg border p-4">
        {shows("mood") && (
        <Field label="Mood">
          <Chips
            name="mood"
            options={MOOD_LABELS.map((label, index) => ({ value: String(index + 1), label }))}
          />
        </Field>
        )}
        {shows("stress") && (
        <Field label="Stress">
          <Chips
            name="stress"
            options={[
              { value: "low", label: "Low" },
              { value: "medium", label: "Medium" },
              { value: "high", label: "High" },
            ]}
          />
        </Field>
        )}
        {shows("energy") && (
        <Field label="Energy">
          <Chips
            name="energy"
            options={[
              { value: "low", label: "Low" },
              { value: "normal", label: "Normal" },
              { value: "high", label: "High" },
            ]}
          />
        </Field>
        )}
        {shows("soreness") && (
        <Field label="Soreness">
          <Chips
            name="soreness"
            options={[
              { value: "none", label: "None" },
              { value: "mild", label: "Mild" },
              { value: "heavy", label: "Heavy" },
            ]}
          />
        </Field>
        )}
        {shows("digestion") && (
        <Field label="Stomach">
          <Chips
            name="digestion"
            options={[
              { value: "good", label: "Good" },
              { value: "sluggish", label: "Sluggish" },
              { value: "bloated", label: "Bloated" },
              { value: "unsettled", label: "Unsettled" },
            ]}
          />
        </Field>
        )}
        {trackers.map((tracker) => (
          <Field key={tracker.id} label={tracker.label}>
            {tracker.kind === "number" ? (
              <label className="flex items-center gap-2">
                <input
                  name={`t_${tracker.id}`}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  className="h-9 w-32 rounded-md border border-input bg-background px-3 text-sm"
                />
                {tracker.unit && <span className="text-sm text-muted-foreground">{tracker.unit}</span>}
              </label>
            ) : (
              <Chips
                name={`t_${tracker.id}`}
                options={
                  tracker.kind === "yesno"
                    ? [
                        { value: "yes", label: "Yes" },
                        { value: "no", label: "No" },
                      ]
                    : ["1", "2", "3", "4", "5"].map((n) => ({ value: n, label: n }))
                }
              />
            )}
          </Field>
        ))}
        <Button type="submit">Save</Button>
        <Link
          href="/journal/trackers"
          className="text-center text-xs text-muted-foreground underline-offset-4 hover:underline"
        >
          Choose what you track
        </Link>
      </form>

      <section>
        <h2 className="eyebrow mb-3">The last two weeks</h2>
        {days.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing yet. The first entry is the start of the pattern.
          </p>
        ) : (
          <ol className="flex flex-col gap-5">
            {days.map((day) => {
              const checkin = checkins.find((c) => c.date === day);
              const dayEntries = entries.filter((e) => e.date === day);
              return (
                <li key={day}>
                  <p className="mb-1.5 text-sm font-medium">{formatDay(day, today)}</p>
                  <ul className="flex flex-col divide-y divide-border border-y border-border">
                    {dayEntries.map((entry) => (
                      <li key={entry.id} className="flex items-center justify-between gap-3 py-2">
                        <span className="text-sm">
                          <span className="figure mr-2 text-xs text-muted-foreground">
                            {formatTime(entry.createdAt)}
                          </span>
                          {describeEntry(entry, trackers)}
                        </span>
                        <form>
                          <button
                            formAction={removeFeeling.bind(null, entry.id)}
                            type="submit"
                            aria-label="Delete this entry"
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </form>
                      </li>
                    ))}
                    {checkin && (
                      <li className="py-2 text-sm">
                        <span className="figure mr-2 text-xs text-muted-foreground">
                          check-in
                        </span>
                        {describeCheckin(checkin)}
                      </li>
                    )}
                  </ul>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </main>
  );
}
