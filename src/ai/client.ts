import Anthropic from "@anthropic-ai/sdk";
import { isDemo } from "@/lib/demo";

/**
 * Opus plans; Sonnet takes over if Opus is rate limited.
 */
export const MODEL_PRIMARY = "claude-opus-5";
export const MODEL_FALLBACK = "claude-sonnet-5";

/** Per attempt; with one retry a call gives up within about two minutes. */
export const AI_TIMEOUT_MS = 60_000;

/**
 * Uses the official Anthropic SDK directly rather than AI Gateway /
 * @ai-sdk providers — this app needs `messages.parse` with a zod output
 * format, and there is no gateway in front of a single personal key.
 *
 * Auth is an API key from the Claude Console (`sk-ant-api...`).
 *
 * NOT the Claude Max subscription token: `CLAUDE_CODE_OAUTH_TOKEN`
 * (from `claude setup-token`) is scoped to Claude Code and the Agent
 * SDK. Anthropic does not permit third-party applications to run on
 * claude.ai subscription limits, and the Messages API rejects such
 * tokens with an opaque 429 rate_limit_error — which looks exactly like
 * a quota problem but is an authorisation-scope refusal. We tried it;
 * it cannot work (decision D16).
 *
 * Returns null when no key is set; callers degrade to the rotation's
 * rules-only plan (design D2: the daily loop never blocks on AI).
 */
export function getAnthropic(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  // The public demo is rules-only, so it costs nothing to run (Phase 16).
  if (!apiKey || isDemo()) return null;
  // The SDK default is 10 minutes per attempt with two retries — longer
  // than any page may run, so a slow call killed the request ("I'm back"
  // crashed) instead of falling back. Capped so the callers' rules-only
  // fallback always gets its turn inside the pages' 300s limit.
  return new Anthropic({ apiKey, timeout: AI_TIMEOUT_MS, maxRetries: 1 });
}
