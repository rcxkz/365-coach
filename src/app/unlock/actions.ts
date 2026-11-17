"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  SESSION_COOKIE,
  authConfig,
  safeEqual,
  sessionTokenFor,
} from "@/lib/auth";

/** A wrong guess costs a second — cheap for a typo, slow for a script. */
const FAILED_ATTEMPT_DELAY_MS = 1000;

export async function unlock(formData: FormData): Promise<void> {
  const passcode = formData.get("passcode");
  const config = authConfig();

  if (
    typeof passcode !== "string" ||
    !config ||
    !safeEqual(passcode, config.passcode)
  ) {
    await new Promise((resolve) => setTimeout(resolve, FAILED_ATTEMPT_DELAY_MS));
    redirect("/unlock?retry=1");
  }

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, await sessionTokenFor(config), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });
  redirect("/");
}
