import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, isValidSession } from "@/lib/auth";

/**
 * First line of every server action. The proxy can't be the only gate:
 * a server action is reachable by POSTing its id to *any* page, the
 * public /unlock page included.
 */
export async function requireSession(): Promise<void> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!(await isValidSession(token))) redirect("/unlock");
}
