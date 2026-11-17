"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { generateWeeklyReview } from "@/ai/generate-review";
import { requireSession } from "@/lib/require-session";

export async function runWeeklyReview(weekStart?: string): Promise<void> {
  await requireSession();
  const { review } = await generateWeeklyReview(weekStart);
  revalidatePath("/review");
  redirect(`/review?week=${review.weekStart}`);
}
