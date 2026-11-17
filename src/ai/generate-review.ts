import { RateLimitError } from "@anthropic-ai/sdk";
import { BEHAVIOURAL_CORE } from "./behavioural-core";
import { getProfile } from "@/data/repos/profile";
import { getAnthropic, MODEL_FALLBACK, MODEL_PRIMARY } from "./client";
import { fitnessVoice } from "./voices/fitness";
import {
  countCompletedBetween,
  getPainForWeek,
  getSessionsBetween,
  saveWeeklyReview,
  type StoredReview,
} from "@/data/repos/reviews";
import { addDaysISO, startOfWeekISO, todayInTimeZone } from "@/domain/dates";
import { summariseWeek, type WeekSummary } from "@/domain/week-review";
import { listJournalEntries, toJournalEntry } from "@/data/repos/journal";
import { formatList } from "@/domain/meals";

/**
 * Weekly review generation (doc 03). The facts and the progression
 * calls are decided in `summariseWeek` — deterministic, testable, and
 * identical with or without AI. The model only turns that into a few
 * calm sentences; if it can't, the rules-written narrative stands.
 */

export type ReviewResult = {
  review: StoredReview;
  mode: "ai" | "rules";
};

const CALL_LABEL: Record<string, string> = {
  progress: "step up",
  hold: "repeat",
  ease: "ease off",
};

/** Reads as a review on its own — the AI is an upgrade, not a crutch. */
export function writeRulesNarrative(summary: WeekSummary): string {
  if (summary.sessionsCompleted === 0 && summary.setsLogged === 0) {
    return "Nothing logged this week. The rotation picks up exactly where it left off — the next session is the only one that matters.";
  }

  const parts: string[] = [];
  parts.push(
    summary.sessionsCompleted === 1
      ? `One session logged this week, ${summary.setsLogged} sets in total.`
      : `${summary.sessionsCompleted} sessions logged this week, ${summary.setsLogged} sets in total.`,
  );

  // Name a few; count the rest — a sentence of twenty exercise names
  // is a list nobody reads (the full calls are listed below it).
  const few = (names: string[]) =>
    names.length <= 3 ? formatList(names) : `${names.slice(0, 2).join(", ")} and ${names.length - 2} more`;
  const stepUps = summary.progressions.filter((p) => p.call === "progress");
  if (stepUps.length > 0) {
    parts.push(
      `${few(stepUps.map((p) => p.name))} cleared ${stepUps.length === 1 ? "its target" : "their targets"} and can step up next week.`,
    );
  }
  const holds = summary.progressions.filter((p) => p.call !== "progress");
  if (holds.length > 0) {
    parts.push(
      holds.length === 1
        ? `${holds[0].name} stays where it is for now.`
        : stepUps.length > 0
          ? "The rest stay where they are for now."
          : `${few(holds.map((p) => p.name))} stay where they are for now.`,
    );
  }
  if (summary.watchouts.length > 0) parts.push(summary.watchouts[0]);
  // The pattern lines say something; the entry count doesn't.
  const pattern = summary.feelings?.find((line) => !/journal entr/.test(line));
  if (pattern) parts.push(pattern);
  return parts.join(" ");
}

function buildPrompt(summary: WeekSummary): string {
  const lines: string[] = [
    `Write the weekly training review for ${summary.weekStart} to ${summary.weekEnd}.`,
    `Sessions completed: ${summary.sessionsCompleted} (previous week: ${summary.previousWeekSessions}). Sets logged: ${summary.setsLogged}.`,
  ];
  if (summary.wins.length) {
    lines.push(`Worth recognising:\n${summary.wins.map((w) => `- ${w}`).join("\n")}`);
  }
  if (summary.progressions.length) {
    lines.push(
      `Progression calls already decided by the system — state them, don't overrule them:\n${summary.progressions
        .map((p) => `- ${p.name}: ${CALL_LABEL[p.call]} (${p.reason})`)
        .join("\n")}`,
    );
  }
  if (summary.watchouts.length) {
    lines.push(`Watch:\n${summary.watchouts.map((w) => `- ${w}`).join("\n")}`);
  }
  if (summary.feelings?.length) {
    lines.push(
      `How they felt, from their journal — mention a pattern only if it's here, never invent one:\n${summary.feelings.map((f) => `- ${f}`).join("\n")}`,
    );
  }
  lines.push(
    "Write 3-5 sentences of plain prose, no headings or bullets. Say what happened, name one genuine specific win if there is one, and state the adjustments for next week. Never imply the user is behind or owes sessions — frequency is a ceiling, not a quota. If the week was quiet, say so without consolation or pressure.",
  );
  return lines.join("\n\n");
}

export async function generateWeeklyReview(
  weekStartInput?: string,
): Promise<ReviewResult> {
  const weekStart =
    weekStartInput ?? startOfWeekISO(addDaysISO(todayInTimeZone(), -7));
  const weekEnd = addDaysISO(weekStart, 6);
  const previousStart = addDaysISO(weekStart, -7);

  const [sessions, pain, previousWeekSessions, journal] = await Promise.all([
    getSessionsBetween(weekStart, weekEnd),
    getPainForWeek(weekStart, weekEnd),
    countCompletedBetween(previousStart, addDaysISO(previousStart, 6)),
    listJournalEntries(weekStart, weekEnd),
  ]);

  const summary = summariseWeek({
    weekStart,
    weekEnd,
    sessions,
    pain,
    previousWeekSessions,
    journal: journal.map(toJournalEntry),
    trackers: (await getProfile()).profile.journal.custom,
  });

  let narrative = writeRulesNarrative(summary);
  let mode: "ai" | "rules" = "rules";

  const client = getAnthropic();
  if (client) {
    try {
      const voice = fitnessVoice((await getProfile()).profile);
      const call = (model: string) =>
        client.messages.create({
          model,
          max_tokens: 700,
          system: `${BEHAVIOURAL_CORE}\n\n${voice}`,
          messages: [{ role: "user", content: buildPrompt(summary) }],
        });

      let response;
      try {
        response = await call(MODEL_PRIMARY);
      } catch (error) {
        if (!(error instanceof RateLimitError)) throw error;
        response = await call(MODEL_FALLBACK);
      }

      const text = response.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("")
        .trim();
      if (text.length > 0) {
        narrative = text;
        mode = "ai";
      }
    } catch (error) {
      console.error("generateWeeklyReview: AI narrative failed", error);
    }
  }

  const review = await saveWeeklyReview({
    weekStart,
    weekEnd,
    narrative,
    summary,
    mode,
  });
  return { review, mode };
}
