"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordMetric } from "@/data/repos/metrics";
import { todayInTimeZone } from "@/domain/dates";
import {
  isMetricKind,
  MOBILITY_TESTS,
  scoreMobility,
} from "@/domain/metrics";
import { requireSession } from "@/lib/require-session";

export async function saveMetric(formData: FormData): Promise<void> {
  await requireSession();
  const kind = String(formData.get("kind") ?? "");
  const raw = String(formData.get("value") ?? "").trim();
  if (!isMetricKind(kind) || raw === "") redirect("/progress?error=1");

  const value = Number(raw);
  try {
    await recordMetric({ date: todayInTimeZone(), kind, value });
  } catch {
    // Out-of-range or unparseable: the form explains and keeps the value.
    redirect(`/progress?error=${encodeURIComponent(kind)}`);
  }
  revalidatePath("/progress");
  redirect(`/progress?saved=${kind}`);
}

export async function saveMobilityScore(formData: FormData): Promise<void> {
  await requireSession();
  const scores: Record<string, number> = {};
  for (const test of MOBILITY_TESTS) {
    scores[test.id] = Number(formData.get(test.id) ?? 0);
  }
  const { total, breakdown } = scoreMobility(scores);

  await recordMetric({
    date: todayInTimeZone(),
    kind: "mobility_score",
    value: total,
    note: breakdown,
  });
  revalidatePath("/progress");
  redirect(`/progress?saved=mobility_score`);
}
