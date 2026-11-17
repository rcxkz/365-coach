import type { SectionCandidates } from "@/domain/candidates";
import type { RotationEntry, SessionTemplate } from "@/domain/templates";

/**
 * Pure prompt assembly for candidate-constrained session generation
 * (Phase 2 design §3) — no I/O, unit tested.
 */

export interface LastPerformance {
  /** Library exercise id → "2026-07-20: 8, 8, 7 @14kg" */
  [exerciseId: string]: string;
}

export interface SessionPromptContext {
  targetDate: string;
  entry: RotationEntry;
  template: SessionTemplate;
  sections: SectionCandidates[];
  memories: string[];
  openPain: string[];
  readinessReasons: string[];
  recentSessions: string[];
  lastPerformance: LastPerformance;
  /** Progression calls from the last weekly review, e.g. "Pull-Up: step up". */
  progressionCalls?: string[];
  /** Set when easing back in after a gap or illness (Phase 8). */
  comingBack?: string;
  /** The user's session length (Phase 15); the template's when absent. */
  sessionMinutes?: number;
}

export function buildSessionPrompt(ctx: SessionPromptContext): string {
  const parts: string[] = [
    `Plan ${ctx.targetDate}. The rotation is up to "${ctx.entry.label}" — a ${ctx.template.name} session (${ctx.template.purpose}) of about ${ctx.sessionMinutes ?? ctx.template.targetDurationMinutes} minutes.`,
  ];

  if (ctx.entry.emphasis) parts.push(`Session emphasis: ${ctx.entry.emphasis}`);

  if (ctx.memories.length) {
    parts.push(
      `What we know about them:\n${ctx.memories.map((m) => `- ${m}`).join("\n")}`,
    );
  }
  if (ctx.openPain.length) {
    parts.push(
      `Currently flagged pain (already applied to the candidate lists):\n${ctx.openPain
        .map((p) => `- ${p}`)
        .join("\n")}`,
    );
  }
  parts.push(
    ctx.readinessReasons.length
      ? `Today's readiness:\n${ctx.readinessReasons.map((r) => `- ${r}`).join("\n")}`
      : "Today's readiness: normal — nothing flagged.",
  );
  if (ctx.recentSessions.length) {
    parts.push(
      `Recent training:\n${ctx.recentSessions.map((w) => `- ${w}`).join("\n")}`,
    );
  }
  if (ctx.comingBack) {
    parts.push(`Coming back: ${ctx.comingBack}`);
  }
  if (ctx.progressionCalls?.length) {
    parts.push(
      `Decided at the last weekly review — honour these rather than re-deciding:\n${ctx.progressionCalls
        .map((call) => `- ${call}`)
        .join("\n")}`,
    );
  }

  const sectionBlocks = ctx.sections
    .filter(({ candidates }) => candidates.length > 0)
    .map(({ section, candidates }) => {
      const lines = candidates.map(({ exercise, cautions }) => {
        const bits = [
          `  ${exercise.id} — ${exercise.name}`,
          `(difficulty ${exercise.difficulty}/5, recovery cost ${exercise.recoveryCost}/5, usual ${exercise.setsMin}-${exercise.setsMax}×${exercise.repsTarget})`,
        ];
        const last = ctx.lastPerformance[exercise.id];
        if (last) bits.push(`[last time: ${last}]`);
        if (cautions.length) bits.push(`[caution: ${cautions.join(" ")}]`);
        return bits.join(" ");
      });
      const slots = section.optional
        ? `${section.count}, optional — omit if the session is already full`
        : `${section.count}`;
      return `${section.role} (choose ${slots}):\n${lines.join("\n")}`;
    });

  parts.push(
    `Choose exercises for each section below, using the exerciseId exactly as written. These lists are already filtered for the user's pain, equipment and readiness — never invent an exercise or use an id that is not listed. Skip a section only if it is marked optional.\n\n${sectionBlocks.join("\n\n")}`,
  );

  parts.push(
    `Set sets, reps and load from the usual ranges, the user's last performance, and today's readiness — progress only when the last session was completed comfortably and pain-free. Mark roughly three exercises as inShortVersion to form the 30-minute variant. Keep any caution shown above in that exercise's note. Every rationale is one calm sentence.`,
  );

  return parts.join("\n\n");
}
