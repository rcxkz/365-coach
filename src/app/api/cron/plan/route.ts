import { NextResponse } from "next/server";
import { planIfNeeded } from "@/ai/plan-if-needed";
import { todayInTimeZone } from "@/domain/dates";
import { cronAuthorised } from "../auth";

export const dynamic = "force-dynamic";

/**
 * Planning is three model calls. The default cut it off part-way on
 * 31 July, leaving a workout with no day around it, so the ceiling is
 * stated rather than inherited.
 */
export const maxDuration = 300;

/**
 * Plans today if it has nothing to open. Kept for manual runs; the
 * scheduled path is /api/cron/morning, which also sends the reminder.
 */
export async function GET(request: Request) {
  if (!cronAuthorised(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const target = todayInTimeZone();
  const planned = await planIfNeeded(target);
  if (planned.skipped) return NextResponse.json({ target, ...planned });
  const { result } = planned;
  if (!result.ok) {
    console.error("cron plan failed", { target, reason: result.reason });
    return NextResponse.json({ target, error: result.reason }, { status: 500 });
  }
  return NextResponse.json({ target, title: result.title, mode: result.mode });
}
