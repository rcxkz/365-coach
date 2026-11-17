/**
 * Demo mode (Phase 16): a public deployment showing a made-up person's
 * week. Set DEMO_MODE=1 on that deployment only. It turns off the
 * passcode, the AI (rules-only, so the demo costs nothing to run) and
 * push reminders, shows a banner, and lets the morning job reset the
 * data to the demo person. Never set it on a real deployment: the reset
 * erases everything.
 */
export function isDemo(): boolean {
  return process.env.DEMO_MODE === "1";
}

/** Where the banner sends people who want their own. */
export function publicRepoUrl(): string {
  return process.env.PUBLIC_REPO_URL?.trim() || "https://github.com";
}
