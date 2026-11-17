import { RateLimitError } from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { BEHAVIOURAL_CORE } from "./behavioural-core";
import { getProfile } from "@/data/repos/profile";
import { getAnthropic, MODEL_FALLBACK, MODEL_PRIMARY } from "./client";
import { fuelVoice } from "./voices/fuel";
import { listCustomIngredients } from "@/data/repos/fuel";
import { INGREDIENTS, ingredientKey, PROTEIN_FOCUS, type UserMealInput } from "@/domain/meals";

/**
 * "Describe it or paste a recipe" (Phase 13): turns free text into a
 * meal draft the user checks before saving. Nothing is saved here — the
 * draft only fills the form, so a wrong guess costs a correction, never
 * a bad meal in the planner.
 */

const MealDraft = z.object({
  name: z.string().describe("Short, plain name, e.g. 'Chicken fajita traybake'"),
  description: z.string().describe("One line: what it is and why it's easy"),
  slots: z.array(z.enum(["dinner", "lunch"])),
  activeMinutes: z.number().int().describe("Hands-on minutes only — not oven or simmer time"),
  totalMinutes: z.number().int(),
  proteinFocus: z.enum(PROTEIN_FOCUS),
  coreIngredients: z
    .array(z.string())
    .describe("Ingredients it can't do without, as lowercase names; reuse the known names exactly where they fit"),
  flexIngredients: z.array(z.string()).describe("Nice to have, not essential"),
  batchFriendly: z.boolean().describe("Scales up to leave lunch portions"),
  freezerFriendly: z.boolean(),
  steps: z.array(z.string()).describe("3–8 short steps"),
});

export type MealDraftResult =
  | { ok: true; draft: UserMealInput; newIngredients: string[] }
  | { ok: false; reason: "not_configured" | "unreadable" | "failed" };

const MAX_INPUT = 6000;

export async function draftMealFromText(text: string): Promise<MealDraftResult> {
  const client = getAnthropic();
  if (!client) return { ok: false, reason: "not_configured" };
  const input = text.trim().slice(0, MAX_INPUT);
  if (input.length < 3) return { ok: false, reason: "unreadable" };

  const custom = await listCustomIngredients();
  const known = [...INGREDIENTS, ...custom.map((row) => row.key)];
  const prompt = [
    "Turn this into one meal for the user's meal list. It may be a short description or a pasted recipe.",
    `Known ingredient names — reuse these exactly (underscores as spaces is fine) wherever one fits, rather than inventing a near-duplicate: ${known.join(", ")}.`,
    "Generic names only: 'chicken thighs', not a brand or a weight. Leave out salt, pepper, oil and water unless they define the dish.",
    // Their dietary rules are in the voice; swaps are named so nothing changes silently.
    "If anything in the text breaks their dietary rules, swap it for a fitting alternative and mention the swap in the description.",
    "If the text clearly isn't a meal, return a name of 'unreadable' and empty lists.",
    `---\n${input}\n---`,
  ].join("\n\n");

  try {
    const voice = fuelVoice((await getProfile()).profile);
    const call = (model: string) =>
      client.messages.parse({
        model,
        max_tokens: 2000,
        system: `${BEHAVIOURAL_CORE}\n\n${voice}`,
        messages: [{ role: "user", content: prompt }],
        output_config: { format: zodOutputFormat(MealDraft) },
      });
    let response;
    try {
      response = await call(MODEL_PRIMARY);
    } catch (error) {
      if (!(error instanceof RateLimitError)) throw error;
      response = await call(MODEL_FALLBACK);
    }
    const draft = response.parsed_output;
    if (!draft || draft.name.toLowerCase() === "unreadable") {
      return { ok: false, reason: "unreadable" };
    }

    const toKeys = (names: string[]) =>
      [...new Set(names.map((name) => ingredientKey(name)).filter((key): key is string => Boolean(key)))];
    const core = toKeys(draft.coreIngredients);
    const flex = toKeys(draft.flexIngredients).filter((key) => !core.includes(key));
    const knownSet = new Set<string>(known);
    return {
      ok: true,
      draft: {
        name: draft.name,
        description: draft.description,
        slots: draft.slots.length ? draft.slots : ["dinner"],
        activeMinutes: draft.activeMinutes,
        totalMinutes: draft.totalMinutes,
        proteinFocus: draft.proteinFocus,
        coreIngredients: core,
        flexIngredients: flex,
        batchFriendly: draft.batchFriendly,
        freezerFriendly: draft.freezerFriendly,
        steps: draft.steps,
      },
      newIngredients: [...core, ...flex].filter((key) => !knownSet.has(key)),
    };
  } catch (error) {
    console.error("draftMealFromText failed", error);
    return { ok: false, reason: "failed" };
  }
}
