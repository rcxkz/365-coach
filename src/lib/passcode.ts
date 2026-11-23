/**
 * Passcodes chosen in the app are stored only as a salted PBKDF2-SHA256
 * hash: "pbkdf2-sha256$<iterations>$<salt>$<hash>" (base64). Web Crypto
 * only, so it runs in the proxy and server actions alike.
 */
const ITERATIONS = 210_000;
const encoder = new TextEncoder();

export const MIN_PASSCODE_LENGTH = 8;

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

async function derive(passcode: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(passcode), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashPasscode(passcode: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(passcode, salt, ITERATIONS);
  return ["pbkdf2-sha256", String(ITERATIONS), toBase64(salt), toBase64(hash)].join("$");
}

export async function verifyPasscode(passcode: string, stored: string): Promise<boolean> {
  const [scheme, iterations, salt, expected] = stored.split("$");
  if (scheme !== "pbkdf2-sha256" || !iterations || !salt || !expected) return false;
  const actual = toBase64(await derive(passcode, fromBase64(salt), Number(iterations)));
  // Constant-time compare.
  let diff = actual.length ^ expected.length;
  for (let i = 0; i < Math.max(actual.length, expected.length); i++) {
    diff |= (actual.charCodeAt(i) || 0) ^ (expected.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/** Why a new passcode won't do, or null if it's fine. */
export function passcodeProblem(passcode: string, confirm: string): string | null {
  if (passcode.trim().length < MIN_PASSCODE_LENGTH) {
    return `Use at least ${MIN_PASSCODE_LENGTH} characters. A short phrase is easier to remember than a code.`;
  }
  if (passcode !== confirm) return "The two didn't match. Type it once more in both boxes.";
  return null;
}
