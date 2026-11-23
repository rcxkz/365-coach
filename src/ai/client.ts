import Anthropic, { APIError, RateLimitError } from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { isDemo } from "@/lib/demo";

/**
 * One small interface in front of the AI, so the app runs on Claude
 * (the default, and what it was built and tuned on) or on any provider
 * that speaks OpenAI's chat format: ChatGPT, Gemini, Groq, OpenRouter,
 * a local Ollama. Results on other models may vary; the rules-only
 * planner still steps in whenever a call fails or returns nothing usable.
 *
 * Configuration, all from the deployment's own environment (never the
 * code), so a copy only ever uses its owner's keys:
 *
 *   ANTHROPIC_API_KEY            → Claude
 *   OPENAI_API_KEY or AI_API_KEY → an OpenAI-compatible provider
 *   AI_BASE_URL                  → that provider's endpoint (default OpenAI)
 *   AI_MODEL, AI_MODEL_FALLBACK  → model names (optional for Claude)
 *   AI_PROVIDER                  → "anthropic" | "openai", only needed
 *                                  when more than one key is set
 *
 * A Claude Pro/Max subscription token cannot be used here: Anthropic
 * does not permit third-party apps on claude.ai subscription limits,
 * and the API rejects those tokens with an opaque 429 (decision D16).
 * The same goes for a ChatGPT Plus subscription — API keys only.
 *
 * Returns null when no key is set; callers degrade to the rotation's
 * rules-only plan (design D2: the daily loop never blocks on AI).
 */

/**
 * Claude's defaults: Sonnet 5.5 plans (choosing among pre-filtered
 * options and writing a few sentences doesn't need Opus); Sonnet 5 takes
 * over if it is rate limited.
 */
export const MODEL_PRIMARY = "claude-sonnet-5-5";
export const MODEL_FALLBACK = "claude-sonnet-5";

/**
 * Output room per call. Claude thinks before answering and the thinking
 * counts toward this limit, so a tight cap cut replies off mid-answer
 * (the weekly review had 700). Length is set in each prompt instead;
 * the limit is only a ceiling, and unused room costs nothing.
 */
export const AI_MAX_TOKENS = 16_000;

/**
 * Claude models that take server-side refusal fallbacks: if a safety
 * check declines a request, the API re-runs it on a fallback model it
 * picks for that kind of decline, inside the same call.
 */
const SERVER_FALLBACK_MODELS = new Set([
  "claude-sonnet-5-5",
  "claude-opus-5-5",
  "claude-opus-5",
  "claude-fable-5-1",
  "claude-fable-5-2",
]);

/** Claude models that take an effort setting. */
const EFFORT_MODEL = /^claude-(sonnet-5|opus-5|haiku-5-5|fable-5|mythos-5)/;

/** A starting point for OpenAI itself; set AI_MODEL for any other provider. */
export const OPENAI_DEFAULT_MODEL = "gpt-5-mini";
export const OPENAI_DEFAULT_BASE_URL = "https://api.openai.com/v1";

/**
 * Per attempt; with one retry a call gives up within about two minutes,
 * inside the pages' 300s limit, so the rules-only fallback always gets
 * its turn ("I'm back" once crashed on the SDK's 10-minute default).
 */
export const AI_TIMEOUT_MS = 60_000;

export type AiProvider = "anthropic" | "openai";

export type AiRequest = {
  /** Shown in the usage log line. */
  label: string;
  system: string;
  prompt: string;
  /**
   * How hard Claude thinks before answering: "low" for simple picks and
   * short writing, "medium" for planning. Ignored by other providers.
   */
  effort: "low" | "medium" | "high";
};

export type StructuredRequest<T> = AiRequest & {
  schema: z.ZodType<T>;
  /** A short identifier for the format, e.g. "week_choice". */
  name: string;
};

export interface AiClient {
  readonly provider: AiProvider;
  /** The checked result, or null when the model refused or returned something unusable. */
  structured<T>(request: StructuredRequest<T>): Promise<T | null>;
  text(request: AiRequest): Promise<string>;
}

/** An OpenAI-compatible provider's error, with what's needed to explain it. */
export class AiHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
    message: string,
  ) {
    super(message);
    this.name = "AiHttpError";
  }
}

type AiConfig =
  | { provider: "anthropic"; apiKey: string; primary: string; fallback: string }
  | { provider: "openai"; apiKey: string; baseUrl: string; primary: string; fallback: string };

function env(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

/** Which provider and models this deployment uses, or null for rules-only. */
export function aiConfig(): AiConfig | null {
  // The public demo is rules-only, so it costs nothing to run (Phase 16).
  if (isDemo()) return null;
  const anthropicKey = env("ANTHROPIC_API_KEY");
  const openaiKey = env("AI_API_KEY") ?? env("OPENAI_API_KEY");
  const chosen = env("AI_PROVIDER")?.toLowerCase();
  const provider: AiProvider | null =
    chosen === "openai" || chosen === "anthropic"
      ? chosen
      : anthropicKey
        ? "anthropic"
        : openaiKey
          ? "openai"
          : null;

  if (provider === "anthropic" && anthropicKey) {
    const primary = env("AI_MODEL") ?? MODEL_PRIMARY;
    return {
      provider,
      apiKey: anthropicKey,
      primary,
      fallback: env("AI_MODEL_FALLBACK") ?? (env("AI_MODEL") ? primary : MODEL_FALLBACK),
    };
  }
  if (provider === "openai" && openaiKey) {
    const primary = env("AI_MODEL") ?? OPENAI_DEFAULT_MODEL;
    return {
      provider,
      apiKey: openaiKey,
      baseUrl: (env("AI_BASE_URL") ?? OPENAI_DEFAULT_BASE_URL).replace(/\/+$/, ""),
      primary,
      fallback: env("AI_MODEL_FALLBACK") ?? primary,
    };
  }
  return null;
}

export function getAi(): AiClient | null {
  const config = aiConfig();
  if (!config) return null;
  return config.provider === "anthropic"
    ? anthropicClient(config)
    : openAiCompatibleClient(config);
}

/**
 * An out-of-credit account, named so the app can say "top up" rather
 * than "something went wrong". Anthropic fails it as a 400 mentioning the
 * credit balance; OpenAI as a 429 "insufficient_quota"; OpenRouter as a 402.
 */
export function isCreditExhausted(error: unknown): boolean {
  if (error instanceof APIError) {
    return typeof error.message === "string" && /credit balance/i.test(error.message);
  }
  if (error instanceof AiHttpError) {
    return error.status === 402 || error.code === "insufficient_quota";
  }
  return false;
}

function isRateLimited(error: unknown): boolean {
  if (error instanceof RateLimitError) return true;
  return error instanceof AiHttpError && error.status === 429 && !isCreditExhausted(error);
}

/** Primary model first; the fallback model only when the primary is rate limited. */
async function withFallback<T>(
  primary: string,
  fallback: string,
  call: (model: string) => Promise<T>,
): Promise<T> {
  try {
    return await call(primary);
  } catch (error) {
    if (!isRateLimited(error) || fallback === primary) throw error;
    return call(fallback);
  }
}

function anthropicClient(config: Extract<AiConfig, { provider: "anthropic" }>): AiClient {
  // The SDK default is 10 minutes per attempt with two retries — longer
  // than any page may run, so it's capped (see AI_TIMEOUT_MS).
  const client = new Anthropic({
    apiKey: config.apiKey,
    timeout: AI_TIMEOUT_MS,
    maxRetries: 1,
  });

  const common = (model: string, request: AiRequest) => ({
    model,
    max_tokens: AI_MAX_TOKENS,
    system: request.system,
    messages: [{ role: "user" as const, content: request.prompt }],
    ...(SERVER_FALLBACK_MODELS.has(model)
      ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
      : {}),
  });
  const effort = (model: string, request: AiRequest) =>
    EFFORT_MODEL.test(model) ? { effort: request.effort } : {};

  // Cost visibility: these run a few times a day on a prepaid balance.
  const logUsage = (label: string, response: { model: string; usage: { input_tokens: number; output_tokens: number } }) =>
    console.log(`${label} usage`, {
      model: response.model,
      input: response.usage.input_tokens,
      output: response.usage.output_tokens,
    });

  return {
    provider: "anthropic",
    async structured<T>(request: StructuredRequest<T>) {
      const response = await withFallback(config.primary, config.fallback, (model) =>
        client.beta.messages.create({
          ...common(model, request),
          output_config: {
            format: betaZodOutputFormat(request.schema),
            ...effort(model, request),
          },
        }),
      );
      logUsage(request.label, response);
      // A refusal here means every model in the fallback chain declined;
      // checked before reading, since a refused reply has no JSON to parse.
      if (response.stop_reason === "refusal") return null;
      const text = response.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("");
      try {
        const parsed = request.schema.safeParse(JSON.parse(text));
        return parsed.success ? parsed.data : null;
      } catch {
        return null;
      }
    },
    async text(request) {
      const response = await withFallback(config.primary, config.fallback, (model) =>
        client.beta.messages.create({
          ...common(model, request),
          output_config: effort(model, request),
        }),
      );
      logUsage(request.label, response);
      if (response.stop_reason === "refusal") return "";
      return response.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("")
        .trim();
    },
  };
}

/**
 * The format as JSON Schema in the shape OpenAI's strict mode accepts:
 * every property required (nullable fields stay required, as null),
 * no extra properties, and no number bounds or $schema keyword.
 */
export function strictJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const tidy = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(tidy);
    if (!node || typeof node !== "object") return node;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      if (key === "$schema" || key === "minimum" || key === "maximum") continue;
      out[key] = tidy(value);
    }
    if (out.type === "object" && out.properties && typeof out.properties === "object") {
      out.required = Object.keys(out.properties);
      out.additionalProperties = false;
    }
    return out;
  };
  return tidy(z.toJSONSchema(schema)) as Record<string, unknown>;
}

type ChatResponse = {
  model?: string;
  choices?: { message?: { content?: string | null; refusal?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

function openAiCompatibleClient(config: Extract<AiConfig, { provider: "openai" }>): AiClient {
  async function chat(body: Record<string, unknown>, label: string): Promise<ChatResponse> {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    });
    if (!response.ok) {
      let code: string | null = null;
      let message = `${response.status} from the AI provider`;
      try {
        const payload = (await response.json()) as {
          error?: { code?: string; type?: string; message?: string };
        };
        code = payload.error?.code ?? payload.error?.type ?? null;
        if (payload.error?.message) message = payload.error.message;
      } catch {
        // Not JSON; the status says enough.
      }
      throw new AiHttpError(response.status, code, message);
    }
    const data = (await response.json()) as ChatResponse;
    console.log(`${label} usage`, {
      model: data.model,
      input: data.usage?.prompt_tokens,
      output: data.usage?.completion_tokens,
    });
    return data;
  }

  const messages = (request: AiRequest, extra = "") => [
    { role: "system", content: request.system + extra },
    { role: "user", content: request.prompt },
  ];

  return {
    provider: "openai",
    async structured<T>(request: StructuredRequest<T>) {
      const jsonSchema = strictJsonSchema(request.schema);
      const strict = (model: string) =>
        chat(
          {
            model,
            messages: messages(request),
            response_format: {
              type: "json_schema",
              json_schema: { name: request.name, schema: jsonSchema, strict: true },
            },
          },
          request.label,
        );
      // Some providers and local models don't take a schema; plain JSON
      // mode with the schema in the instructions still gets most of them there.
      const loose = (model: string) =>
        chat(
          {
            model,
            messages: messages(
              request,
              `\n\nReply with only a JSON object matching this JSON Schema:\n${JSON.stringify(jsonSchema)}`,
            ),
            response_format: { type: "json_object" },
          },
          request.label,
        );

      let data: ChatResponse;
      try {
        data = await withFallback(config.primary, config.fallback, strict);
      } catch (error) {
        if (!(error instanceof AiHttpError) || error.status !== 400 || isCreditExhausted(error)) {
          throw error;
        }
        data = await withFallback(config.primary, config.fallback, loose);
      }

      const message = data.choices?.[0]?.message;
      if (!message || message.refusal || !message.content) return null;
      try {
        const parsed = request.schema.safeParse(JSON.parse(stripFence(message.content)));
        return parsed.success ? parsed.data : null;
      } catch {
        return null;
      }
    },
    async text(request) {
      const data = await withFallback(config.primary, config.fallback, (model) =>
        chat({ model, messages: messages(request) }, request.label),
      );
      return data.choices?.[0]?.message?.content?.trim() ?? "";
    },
  };
}

/** Some models wrap JSON in a ```json fence even in JSON mode. */
function stripFence(text: string): string {
  const match = text.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return match ? match[1] : text;
}
