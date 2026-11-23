import { NextResponse } from "next/server";
import { buildDemo } from "@/ai/demo";
import { planIfNeeded } from "@/ai/plan-if-needed";
import { isDemo } from "@/lib/demo";
import { getOpenPause } from "@/data/repos/pauses";
import {
  claimReminder,
  deletePushSubscription,
  listPushSubscriptions,
} from "@/data/repos/push";
import { getDayActions } from "@/data/repos/today";
import { getWorkoutByDate } from "@/data/repos/workouts";
import { todayInTimeZone } from "@/domain/dates";
import {
  hourInTimeZone,
  MORNING_REMINDER_HOUR,
  morningReminder,
} from "@/domain/reminders";
import { sendPush, vapidPublicKey } from "@/services/push";
import { cronAuthorised } from "../auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * The morning run (Phase 9). Scheduled twice, at 06:00 and 07:00 UTC:
 * Vercel Hobby runs a daily cron somewhere within its hour, and with
 * the clocks changing exactly one of the two lands in London's 07:00
 * hour all year. Each run plans today if needed; only the one in the
 * 07:00 hour sends the reminder, and only once (claimReminder).
 */
export async function GET(request: Request) {
  if (!cronAuthorised(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const target = todayInTimeZone();
  // Read when the run starts: planning can take minutes, and a run that
  // began at 06:58 London time mustn't miss its reminder by finishing
  // after 08:00.
  const hour = hourInTimeZone();
  // The public demo starts each day fresh as its made-up person, and
  // never sends reminders (Phase 16).
  if (isDemo()) {
    await buildDemo(target);
    return NextResponse.json({ target, demo: "rebuilt" });
  }
  const planned = await planIfNeeded(target);
  const plan = planned.skipped
    ? "already_planned"
    : planned.result.ok
      ? planned.result.mode
      : "failed";

  if (hour !== MORNING_REMINDER_HOUR) {
    return NextResponse.json({ target, plan, reminder: `not_now_${hour}h` });
  }
  return NextResponse.json({ target, plan, reminder: await sendMorningReminder(target) });
}

async function sendMorningReminder(date: string): Promise<string> {
  if (!vapidPublicKey()) return "not_configured";
  const subscriptions = await listPushSubscriptions();
  if (subscriptions.length === 0) return "no_devices";

  const [pause, workout, actions] = await Promise.all([
    getOpenPause(),
    getWorkoutByDate(date),
    getDayActions(date),
  ]);
  const message = morningReminder({
    paused: pause !== null,
    workout: workout
      ? {
          title: workout.title,
          durationMinutes: workout.durationMinutes,
          returnSession: workout.returnSession,
          status: workout.status,
        }
      : null,
    otherActions: actions.filter((a) => a.kind !== "workout" && a.status === "pending").length,
  });
  if (!message) return "nothing_to_say";
  if (!(await claimReminder("morning", date))) return "already_sent";

  let sent = 0;
  for (const subscription of subscriptions) {
    const outcome = await sendPush(subscription, message);
    if (outcome === "sent") sent++;
    if (outcome === "expired") await deletePushSubscription(subscription.endpoint);
  }
  return `sent_${sent}_of_${subscriptions.length}`;
}
