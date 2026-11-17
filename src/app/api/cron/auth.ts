import { safeEqual } from "@/lib/auth";

/**
 * Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}` when the env
 * var is set. Cron routes are public in the proxy and check this.
 */
export function cronAuthorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  return Boolean(secret) && safeEqual(header, `Bearer ${secret}`);
}
