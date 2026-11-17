"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adaptTodayPlan } from "@/ai/adapt-day";
import { addJournalEntry, deleteJournalEntry } from "@/data/repos/journal";
import { getProfile, saveProfile } from "@/data/repos/profile";
import { todayInTimeZone } from "@/domain/dates";
import { DIGESTION_STATES, STRESS_LEVELS } from "@/domain/journal";
import {
  BUILT_IN_TRACKERS,
  MAX_CUSTOM_TRACKERS,
  TRACKER_KINDS,
  type CustomTracker,
} from "@/domain/profile";
import { ingredientKey } from "@/domain/meals";
import { CHECKIN_ENERGY, CHECKIN_SORENESS } from "@/domain/readiness";
import { requireSession } from "@/lib/require-session";

function pick<T extends string>(
  value: FormDataEntryValue | null,
  allowed: readonly T[],
): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

function pickMood(value: FormDataEntryValue | null): number | null {
  const mood = Number(value);
  return Number.isInteger(mood) && mood >= 1 && mood <= 5 ? mood : null;
}

/** The user's own trackers from the form: `t_<id>` per tracker (Phase 15). */
function readCustom(formData: FormData, trackers: CustomTracker[]): Record<string, number | boolean> {
  const values: Record<string, number | boolean> = {};
  for (const tracker of trackers) {
    const raw = formData.get(`t_${tracker.id}`);
    if (raw === null || raw === "") continue;
    if (tracker.kind === "yesno") {
      if (raw === "yes" || raw === "no") values[tracker.id] = raw === "yes";
    } else if (tracker.kind === "scale") {
      const n = Number(raw);
      if (Number.isInteger(n) && n >= 1 && n <= 5) values[tracker.id] = n;
    } else {
      const n = Number(raw);
      if (Number.isFinite(n) && n >= 0 && n <= 1_000_000) values[tracker.id] = n;
    }
  }
  return values;
}

export async function logFeeling(formData: FormData): Promise<void> {
  await requireSession();
  const entry = {
    mood: pickMood(formData.get("mood")),
    stress: pick(formData.get("stress"), STRESS_LEVELS),
    energy: pick(formData.get("energy"), CHECKIN_ENERGY),
    soreness: pick(formData.get("soreness"), CHECKIN_SORENESS),
    digestion: pick(formData.get("digestion"), DIGESTION_STATES),
  };
  const custom = readCustom(formData, (await getProfile()).profile.journal.custom);
  if (Object.values(entry).every((value) => value === null) && Object.keys(custom).length === 0) {
    redirect("/journal?empty=1");
  }
  await addJournalEntry({ date: todayInTimeZone(), ...entry, custom });

  // Stress or energy logged before training reshapes today's session
  // straight away — deterministic, so saving never waits on AI.
  const result =
    entry.stress || entry.energy || entry.soreness ? await adaptTodayPlan() : null;
  revalidatePath("/journal");
  revalidatePath("/");
  revalidatePath("/workout");
  redirect(result?.adapted ? "/journal?saved=1&adapted=1" : "/journal?saved=1");
}

export async function removeFeeling(id: number): Promise<void> {
  await requireSession();
  await deleteJournalEntry(id);
  revalidatePath("/journal");
  redirect("/journal");
}

function refreshTrackers() {
  revalidatePath("/journal");
  revalidatePath("/journal/trackers");
}

/** Which built-in trackers show — ticked ones stay, the rest hide. */
export async function saveBuiltInTrackers(formData: FormData): Promise<void> {
  await requireSession();
  const shown = new Set(formData.getAll("shown").map(String));
  const { profile } = await getProfile();
  await saveProfile({
    ...profile,
    journal: { ...profile.journal, hidden: BUILT_IN_TRACKERS.filter((key) => !shown.has(key)) },
  });
  refreshTrackers();
  redirect("/journal/trackers?saved=1");
}

export async function addTracker(formData: FormData): Promise<void> {
  await requireSession();
  const label = String(formData.get("label") ?? "").trim();
  const kind = String(formData.get("kind") ?? "");
  const { profile } = await getProfile();
  const id = ingredientKey(label)?.replace(/_+$/, "");
  if (
    !label ||
    !id ||
    !(TRACKER_KINDS as readonly string[]).includes(kind) ||
    profile.journal.custom.length >= MAX_CUSTOM_TRACKERS ||
    profile.journal.custom.some((tracker) => tracker.id === id)
  ) {
    redirect("/journal/trackers?problem=1");
  }
  await saveProfile({
    ...profile,
    journal: {
      ...profile.journal,
      custom: [
        ...profile.journal.custom,
        { id, label, kind, unit: String(formData.get("unit") ?? "") },
      ],
    },
  });
  refreshTrackers();
  redirect("/journal/trackers?added=1");
}

/** Removes the tracker from the form; past entries keep their values. */
export async function removeTracker(id: string): Promise<void> {
  await requireSession();
  const { profile } = await getProfile();
  await saveProfile({
    ...profile,
    journal: {
      ...profile.journal,
      custom: profile.journal.custom.filter((tracker) => tracker.id !== id),
    },
  });
  refreshTrackers();
  redirect("/journal/trackers");
}
