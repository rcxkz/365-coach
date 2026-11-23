/**
 * Single-user session auth: the unlock action sets a cookie holding an
 * HMAC over the passcode; the proxy and every server action admit
 * requests whose cookie matches. Web Crypto only (runs in the proxy and
 * server actions alike).
 *
 * Two ways to have a passcode:
 * - APP_PASSCODE in the environment — stateless, no database read.
 * - Chosen in the app on first open (when APP_PASSCODE isn't set): the
 *   owner's database holds a PBKDF2 hash, and the cookie is bound to it.
 * Either way the passcode (or its hash) is part of the signed message,
 * so changing it signs every other device out — the way to revoke a
 * lost phone.
 *
 * With nothing to sign with: open in development, closed in production.
 * A deploy that's missing a piece must not publish the app.
 */
export const SESSION_COOKIE = "p365_session";

const encoder = new TextEncoder();

type AuthConfig = { secret: string; passcode: string };

/**
 * What cookies are signed with. AUTH_SECRET is optional: without it the
 * database connection string is used, a long server-only secret every
 * real deployment already has. (Changing the database password then
 * signs devices out, the same as changing the passcode.)
 */
export function signingSecret(): string | null {
  const explicit = process.env.AUTH_SECRET?.trim();
  const database = process.env.DATABASE_URL?.trim();
  return explicit || (database ? `p365-db-key:${database}` : null);
}

/** The passcode from APP_PASSCODE, with what to sign it with. */
export function authConfig(): AuthConfig | null {
  const passcode = process.env.APP_PASSCODE?.trim();
  const secret = signingSecret();
  return passcode && secret ? { secret, passcode } : null;
}

/**
 * Whether the passcode is chosen in the app: no APP_PASSCODE, a real
 * database to keep its hash in, and something to sign with.
 */
export function inAppPasscode(): boolean {
  if (process.env.APP_PASSCODE?.trim()) return false;
  const database = Boolean(process.env.DATABASE_URL?.trim()) || Boolean(process.env.VITEST);
  return database && signingSecret() !== null;
}

/** The cookie for a passcode chosen in the app, bound to its stored hash. */
export function lockTokenFor(secret: string, passcodeHash: string): Promise<string> {
  return sessionTokenFor({ secret, passcode: `in-app:${passcodeHash}` });
}

/**
 * The stored hash, remembered briefly so the proxy doesn't read the
 * database on every request. A cookie that doesn't match the remembered
 * hash is always re-checked against a fresh read, so a new passcode
 * works at once; an old cookie can outlive a passcode change by at most
 * a minute on another server instance.
 */
let remembered: { hash: string; at: number } | null = null;
const REMEMBER_MS = 60_000;

async function readLockHash(): Promise<string | null> {
  const { getLockHash } = await import("@/data/repos/lock");
  const hash = await getLockHash();
  remembered = hash ? { hash, at: Date.now() } : null;
  return hash;
}

/** Forget the remembered hash (after claiming or changing the passcode). */
export function forgetLockHash(): void {
  remembered = null;
}

/** The gate is off for `next dev` with nothing configured, and for the public demo. */
export function authDisabled(): boolean {
  // The public demo is open by design (Phase 16) — but only where no
  // passcode is set, so a real deployment with DEMO_MODE switched on by
  // mistake stays locked (the same rule the demo reset follows).
  if (process.env.DEMO_MODE === "1" && !process.env.APP_PASSCODE?.trim()) return true;
  return !authConfig() && process.env.NODE_ENV === "development";
}

export async function sessionTokenFor({
  secret,
  passcode,
}: AuthConfig): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`p365-session-v2:${passcode}`),
  );
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

/** Compares without leaking, through timing, how much of a guess matched. */
export function safeEqual(a: string, b: string): boolean {
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  let diff = left.length ^ right.length;
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return diff === 0;
}

export async function isValidSession(
  token: string | undefined,
): Promise<boolean> {
  if (authDisabled()) return true;
  if (!token) return false;
  const config = authConfig();
  if (config) return safeEqual(token, await sessionTokenFor(config));
  if (!inAppPasscode()) return false;

  const secret = signingSecret()!;
  if (remembered && Date.now() - remembered.at < REMEMBER_MS) {
    if (safeEqual(token, await lockTokenFor(secret, remembered.hash))) return true;
  }
  const hash = await readLockHash();
  return hash !== null && safeEqual(token, await lockTokenFor(secret, hash));
}

/** For the unlock page: which form to show. */
export async function passcodeState(): Promise<"env" | "claimed" | "unclaimed" | "unavailable"> {
  if (authConfig()) return "env";
  if (!inAppPasscode()) return "unavailable";
  return (await readLockHash()) ? "claimed" : "unclaimed";
}
