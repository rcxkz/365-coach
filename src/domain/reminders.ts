import { RAMP_SESSIONS } from "./comeback";
import { USER_TIME_ZONE } from "./dates";

/**
 * The morning reminder (Phase 9). One a day at most, and only when
 * there's something to open the app for: doc 10 forbids notifications
 * sent "simply to increase engagement".
 */

/** London hour the reminder belongs to (target wake 07:30–08:00, doc 02). */
export const MORNING_REMINDER_HOUR = 7;

export function hourInTimeZone(
  now: Date = new Date(),
  timeZone: string = USER_TIME_ZONE,
): number {
  const hour = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    hourCycle: "h23",
  }).format(now);
  return Number(hour);
}

export interface ReminderMessage {
  title: string;
  body: string;
}

/**
 * What the morning push says. Null means "say nothing": no session to
 * open (paused, or nothing planned), or it's already been done.
 */
export function morningReminder(day: {
  paused: boolean;
  workout: {
    title: string;
    durationMinutes: number | null;
    returnSession: number | null;
    status: "planned" | "completed" | "skipped";
  } | null;
  otherActions: number;
}): ReminderMessage | null {
  if (day.paused || !day.workout || day.workout.status !== "planned") return null;
  const { workout } = day;
  const minutes = workout.durationMinutes ? ` · ~${workout.durationMinutes} min` : "";
  const title = `Today: ${workout.title}${minutes}`;
  if (workout.returnSession === 1) {
    return {
      title,
      body: "First session back is ready — lighter on purpose. Check in and go.",
    };
  }
  if (workout.returnSession) {
    return {
      title,
      body: `Session ${workout.returnSession} of ${RAMP_SESSIONS} back. A tap on how you're feeling tunes it.`,
    };
  }
  const rest =
    day.otherActions > 0
      ? ` ${day.otherActions === 1 ? "One other thing" : `${day.otherActions} other things`} on today's list.`
      : "";
  return {
    title,
    body: `A tap on how you're feeling tunes it before you go.${rest}`,
  };
}
