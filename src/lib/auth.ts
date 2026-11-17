/**
 * Single-user session auth: the unlock action sets a cookie holding
 * HMAC(AUTH_SECRET, passcode); the proxy and every server action admit
 * requests whose cookie matches. Stateless, no DB, Web Crypto only
 * (runs in proxy and server actions alike).
 *
 * The passcode is part of the signed message, so changing APP_PASSCODE
 * signs every device out — the way to revoke a lost phone.
 *
 * Unconfigured (no AUTH_SECRET or APP_PASSCODE): open in development,
 * closed in production. A deploy that forgot its env vars must not
 * publish the app to the internet.
 */
export const SESSION_COOKIE = "p365_session";

const encoder = new TextEncoder();

type AuthConfig = { secret: string; passcode: string };

export function authConfig(): AuthConfig | null {
  const secret = process.env.AUTH_SECRET?.trim();
  const passcode = process.env.APP_PASSCODE?.trim();
  return secret && passcode ? { secret, passcode } : null;
}

/** The gate is off for `next dev` with nothing configured, and for the public demo. */
export function authDisabled(): boolean {
  // The public demo is open by design (Phase 16).
  if (process.env.DEMO_MODE === "1") return true;
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
  const config = authConfig();
  if (!config || !token) return false;
  return safeEqual(token, await sessionTokenFor(config));
}
