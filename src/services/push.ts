import webpush from "web-push";

/**
 * Web Push behind a small interface (services README). VAPID keys come
 * from the environment — generate once with `npx web-push
 * generate-vapid-keys`. Without them, reminders are simply off.
 */

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export type PushOutcome = "sent" | "expired" | "failed";

function vapid() {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:owner@example.com";
  return publicKey && privateKey ? { publicKey, privateKey, subject } : null;
}

/** The key browsers need to subscribe; null when push isn't set up. */
export function vapidPublicKey(): string | null {
  // No notifications from the public demo (Phase 16).
  if (process.env.DEMO_MODE === "1") return null;
  return vapid()?.publicKey ?? null;
}

export async function sendPush(
  target: PushTarget,
  message: { title: string; body: string; url?: string },
): Promise<PushOutcome> {
  const keys = vapid();
  if (!keys) return "failed";
  try {
    await webpush.sendNotification(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      JSON.stringify({ url: "/", ...message }),
      {
        vapidDetails: keys,
        // A morning reminder delivered at lunchtime is noise.
        TTL: 60 * 60 * 3,
        urgency: "normal",
      },
    );
    return "sent";
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    // 404/410: the browser dropped the subscription (app removed,
    // permission revoked). Anything else may be transient.
    if (status === 404 || status === 410) return "expired";
    console.error("sendPush failed", { status, message: (error as Error).message });
    return "failed";
  }
}
