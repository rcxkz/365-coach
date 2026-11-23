import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { aiConfig, AiHttpError, getAi, isCreditExhausted, strictJsonSchema } from "./client";
import { generateWeekPlan } from "./generate-week-plan";
import { MEAL_LIBRARY } from "@/data/library/meals";
import { upsertMeals } from "@/data/repos/fuel";

const KEYS = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "AI_API_KEY", "AI_PROVIDER", "AI_MODEL", "AI_MODEL_FALLBACK", "AI_BASE_URL", "DEMO_MODE"];

function clearKeys() {
  for (const key of KEYS) vi.stubEnv(key, "");
}

type Call = { url: string; body: Record<string, unknown>; auth: string | null };

/** Stands in for an OpenAI-compatible provider: each reply in turn. */
function provider(...replies: (Response | ((call: Call) => Response))[]) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const call = {
        url,
        body: JSON.parse(String(init.body)),
        auth: new Headers(init.headers).get("authorization"),
      };
      calls.push(call);
      const next = replies.shift();
      if (!next) throw new Error("unexpected extra call");
      return typeof next === "function" ? next(call) : next;
    }),
  );
  return calls;
}

const reply = (content: string) =>
  Response.json({ model: "test-model", choices: [{ message: { content } }], usage: {} });
const failure = (status: number, code: string, message = "nope") =>
  Response.json({ error: { code, message } }, { status });

const Choice = z.object({ pick: z.string(), note: z.string().nullable() });
const request = {
  label: "test",
  system: "Be calm.",
  prompt: "Choose one.",
  effort: "low" as const,
  schema: Choice,
  name: "choice",
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("aiConfig", () => {
  it("is rules-only with no key, and on the demo", () => {
    clearKeys();
    expect(aiConfig()).toBeNull();
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
    vi.stubEnv("DEMO_MODE", "1");
    expect(aiConfig()).toBeNull();
  });

  it("uses Claude for an Anthropic key", () => {
    clearKeys();
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
    expect(aiConfig()).toMatchObject({
      provider: "anthropic",
      primary: "claude-sonnet-5-5",
      fallback: "claude-sonnet-5",
    });
  });

  it("uses OpenAI for an OpenAI key alone", () => {
    clearKeys();
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    expect(aiConfig()).toMatchObject({
      provider: "openai",
      baseUrl: "https://api.openai.com/v1",
      primary: "gpt-5-mini",
    });
  });

  it("points at any compatible provider with a base URL and model", () => {
    clearKeys();
    vi.stubEnv("AI_API_KEY", "key");
    vi.stubEnv("AI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta/openai/");
    vi.stubEnv("AI_MODEL", "gemini-2.5-flash");
    expect(aiConfig()).toMatchObject({
      provider: "openai",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      primary: "gemini-2.5-flash",
      fallback: "gemini-2.5-flash",
    });
  });

  it("prefers Claude when both keys are set, unless told otherwise", () => {
    clearKeys();
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    expect(aiConfig()?.provider).toBe("anthropic");
    vi.stubEnv("AI_PROVIDER", "openai");
    expect(aiConfig()?.provider).toBe("openai");
  });
});

describe("strictJsonSchema", () => {
  it("makes every property required, closed, and drops number bounds", () => {
    const schema = strictJsonSchema(
      z.object({ n: z.number().int(), maybe: z.string().nullable(), list: z.array(z.object({ id: z.string() })) }),
    );
    expect(schema.$schema).toBeUndefined();
    expect(schema.required).toEqual(["n", "maybe", "list"]);
    expect(schema.additionalProperties).toBe(false);
    const props = schema.properties as Record<string, Record<string, unknown>>;
    expect(props.n.minimum).toBeUndefined();
    expect(props.maybe.type).toEqual(["string", "null"]);
    expect((props.list.items as Record<string, unknown>).additionalProperties).toBe(false);
  });
});

describe("an OpenAI-compatible provider", () => {
  it("asks for the strict format with the owner's key and checks the reply", async () => {
    clearKeys();
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    const calls = provider(reply('{"pick":"a","note":null}'));
    expect(await getAi()!.structured(request)).toEqual({ pick: "a", note: null });
    expect(calls[0].url).toBe("https://api.openai.com/v1/chat/completions");
    expect(calls[0].auth).toBe("Bearer sk-test");
    expect(calls[0].body.response_format).toMatchObject({
      type: "json_schema",
      json_schema: { name: "choice", strict: true },
    });
  });

  it("moves to the fallback model when rate limited", async () => {
    clearKeys();
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    vi.stubEnv("AI_MODEL", "big");
    vi.stubEnv("AI_MODEL_FALLBACK", "small");
    const calls = provider(failure(429, "rate_limit_exceeded"), reply('{"pick":"b","note":"ok"}'));
    expect(await getAi()!.structured(request)).toEqual({ pick: "b", note: "ok" });
    expect(calls.map((call) => call.body.model)).toEqual(["big", "small"]);
  });

  it("falls back to plain JSON mode where a schema isn't supported", async () => {
    clearKeys();
    vi.stubEnv("AI_API_KEY", "key");
    vi.stubEnv("AI_BASE_URL", "http://localhost:11434/v1");
    vi.stubEnv("AI_MODEL", "llama3.2");
    const calls = provider(
      failure(400, "invalid_request_error", "response_format json_schema is not supported"),
      reply('```json\n{"pick":"c","note":null}\n```'),
    );
    expect(await getAi()!.structured(request)).toEqual({ pick: "c", note: null });
    expect(calls[1].body.response_format).toEqual({ type: "json_object" });
  });

  it("returns null, not a guess, when the reply doesn't fit the format", async () => {
    clearKeys();
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    provider(reply('{"pick":42}'));
    expect(await getAi()!.structured(request)).toBeNull();
    provider(reply("I'd suggest the first one."));
    expect(await getAi()!.structured(request)).toBeNull();
  });

  it("names an empty account so Today can say so, without retrying", async () => {
    clearKeys();
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    const calls = provider(failure(429, "insufficient_quota", "You exceeded your current quota"));
    const error = await getAi()!.structured(request).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AiHttpError);
    expect(isCreditExhausted(error)).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it("writes plain text for the weekly review", async () => {
    clearKeys();
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    const calls = provider(reply("  A steady week.  "));
    expect(
      await getAi()!.text({ label: "test", system: "s", prompt: "p", effort: "low" }),
    ).toBe("A steady week.");
    expect(calls[0].body.response_format).toBeUndefined();
  });
});

describe("a week plan on an OpenAI-compatible provider", () => {
  beforeAll(async () => {
    await upsertMeals(MEAL_LIBRARY);
  });

  it("uses the model's picks, and drops any it invents", async () => {
    clearKeys();
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    provider((call) => {
      const prompt = String((call.body.messages as { content: string }[])[1].content);
      const offered = MEAL_LIBRARY.filter((meal) => prompt.includes(meal.id)).slice(0, 2);
      return reply(
        JSON.stringify({
          meals: [
            ...offered.map((meal) => ({ mealId: meal.id, reason: "Shares the shop." })),
            { mealId: "made_up_meal", reason: "Invented." },
          ],
        }),
      );
    });
    const result = await generateWeekPlan("2026-09-07", { lunches: 0 });
    expect(result.mode).toBe("ai");
    expect(result.meals.some((meal) => meal.mealId === "made_up_meal")).toBe(false);
  });
});

describe("Claude", () => {
  const message = (model: string, text: string, stop = "end_turn") =>
    Response.json({
      id: "msg_test",
      type: "message",
      role: "assistant",
      model,
      content: [{ type: "text", text }],
      stop_reason: stop,
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 5 },
    });

  function claude(...replies: Response[]) {
    const calls: { body: Record<string, unknown>; beta: string | null }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        calls.push({
          body: JSON.parse(String(init.body)),
          beta: new Headers(init.headers).get("anthropic-beta"),
        });
        const next = replies.shift();
        if (!next) throw new Error("unexpected extra call");
        return next;
      }),
    );
    return calls;
  }

  it("plans on Sonnet 5.5 with room to think, an effort level and refusal fallbacks", async () => {
    clearKeys();
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
    const calls = claude(message("claude-sonnet-5-5", '{"pick":"a","note":null}'));
    expect(await getAi()!.structured(request)).toEqual({ pick: "a", note: null });
    const { body, beta } = calls[0];
    expect(body.model).toBe("claude-sonnet-5-5");
    // Thinking counts toward max_tokens: a tight cap cut replies off.
    expect(body.max_tokens).toBe(16000);
    expect(body.fallbacks).toBe("default");
    expect(beta).toContain("server-side-fallback-2026-07-01");
    expect(body.output_config).toMatchObject({ effort: "low", format: { type: "json_schema" } });
  });

  it("runs on whichever Claude model AI_MODEL names", async () => {
    clearKeys();
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
    vi.stubEnv("AI_MODEL", "claude-fable-5-2");
    const calls = claude(message("claude-fable-5-2", '{"pick":"f","note":null}'));
    expect(await getAi()!.structured(request)).toEqual({ pick: "f", note: null });
    expect(calls[0].body.model).toBe("claude-fable-5-2");
    expect(calls[0].body.fallbacks).toBe("default");
    expect(calls[0].body.output_config).toMatchObject({ effort: "low" });
    // No thinking setting is sent, so models where it's always on accept the request.
    expect(calls[0].body.thinking).toBeUndefined();
  });

  it("treats a refusal from the whole chain as nothing usable", async () => {
    clearKeys();
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
    claude(message("claude-sonnet-5-5", "", "refusal"));
    expect(await getAi()!.structured(request)).toBeNull();
  });

  it("moves to Sonnet 5 when rate limited, without fallbacks it doesn't take", async () => {
    clearKeys();
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
    const calls = claude(
      Response.json(
        { type: "error", error: { type: "rate_limit_error", message: "slow down" } },
        { status: 429, headers: { "x-should-retry": "false" } },
      ),
      message("claude-sonnet-5", "A steady week."),
    );
    expect(
      await getAi()!.text({ label: "test", system: "s", prompt: "p", effort: "low" }),
    ).toBe("A steady week.");
    expect(calls.map((call) => call.body.model)).toEqual(["claude-sonnet-5-5", "claude-sonnet-5"]);
    expect(calls[1].body.fallbacks).toBeUndefined();
    expect(calls[1].body.max_tokens).toBe(16000);
  });
});
