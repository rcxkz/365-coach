/**
 * The user's time zone — "today" follows their clock, not the server's.
 * Each deployment sets APP_TIME_ZONE (an IANA name such as
 * "America/New_York"); unset or invalid means Europe/London. Read once at
 * load, the one piece of configuration this module takes.
 */
export const USER_TIME_ZONE = resolveTimeZone(
  typeof process !== "undefined" ? process.env.APP_TIME_ZONE : undefined,
);

export function resolveTimeZone(value: string | undefined): string {
  const zone = value?.trim();
  if (!zone) return "Europe/London";
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: zone });
    return zone;
  } catch {
    return "Europe/London";
  }
}

/**
 * Returns the calendar date (YYYY-MM-DD) in the given time zone.
 * "Today" must follow the user's clock, not the server's.
 */
/** Adds days to a YYYY-MM-DD date string (UTC arithmetic, no DST drift). */
export function addDaysISO(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

export function todayInTimeZone(
  timeZone: string = USER_TIME_ZONE,
  now: Date = new Date(),
): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Monday of the week containing `date` — weeks start Monday in the UK. */
export function startOfWeekISO(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  // getUTCDay: 0 = Sunday, so Sunday belongs to the week that began 6 days ago.
  const offset = (utc.getUTCDay() + 6) % 7;
  return addDaysISO(date, -offset);
}
