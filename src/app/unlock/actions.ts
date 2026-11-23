"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { claimLock, getLockHash } from "@/data/repos/lock";
import {
  SESSION_COOKIE,
  authConfig,
  forgetLockHash,
  inAppPasscode,
  lockTokenFor,
  safeEqual,
  sessionTokenFor,
  signingSecret,
} from "@/lib/auth";
import { hashPasscode, passcodeProblem, verifyPasscode } from "@/lib/passcode";

/** A wrong guess costs a second — cheap for a typo, slow for a script. */
const FAILED_ATTEMPT_DELAY_MS = 1000;

async function setSessionCookie(token: string): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });
}

async function refuse(): Promise<never> {
  await new Promise((resolve) => setTimeout(resolve, FAILED_ATTEMPT_DELAY_MS));
  redirect("/unlock?retry=1");
}

export async function unlock(formData: FormData): Promise<void> {
  const passcode = formData.get("passcode");
  if (typeof passcode !== "string") return refuse();

  // Passcode set in the environment.
  const config = authConfig();
  if (config) {
    if (!safeEqual(passcode, config.passcode)) return refuse();
    await setSessionCookie(await sessionTokenFor(config));
    redirect("/");
  }

  // Passcode chosen in the app.
  if (!inAppPasscode()) return refuse();
  const hash = await getLockHash();
  if (!hash) redirect("/unlock");
  if (!(await verifyPasscode(passcode, hash))) return refuse();
  await setSessionCookie(await lockTokenFor(signingSecret()!, hash));
  redirect("/");
}

/**
 * First open of a new copy: whoever chooses a passcode first claims it.
 * Only a hash is stored, and they're signed straight in.
 */
export async function choosePasscode(formData: FormData): Promise<void> {
  if (!inAppPasscode()) redirect("/unlock");
  const passcode = String(formData.get("passcode") ?? "");
  const problem = passcodeProblem(passcode, String(formData.get("confirm") ?? ""));
  if (problem) redirect(`/unlock?problem=${encodeURIComponent(problem)}`);

  const hash = await hashPasscode(passcode);
  // Lost the race (or it was already set): unlock like anyone else.
  if (!(await claimLock(hash))) redirect("/unlock?taken=1");
  forgetLockHash();
  await setSessionCookie(await lockTokenFor(signingSecret()!, hash));
  redirect("/");
}
