import type { Profile } from "@/domain/profile";

/**
 * Fitness voice — the specialist lens layered on the behavioural core
 * (doc 03). Built from the user's setup (Phase 15) rather than written
 * about one person: anything personal beyond the setup lives in "What
 * the coach knows", which the planner passes alongside.
 */

const EXPERIENCE: Record<Profile["training"]["experience"], string> = {
  new: "someone new to structured training — teach through the choice of movements, keep everything simple and learnable",
  some: "someone with some training behind them",
  experienced: "an experienced trainee",
};

export function fitnessVoice(profile: Profile): string {
  const { training, protect, name } = profile;
  const who = [
    EXPERIENCE[training.experience],
    training.returning
      ? "returning after time away. They may remember being stronger; the programme is built from what they can safely do now"
      : null,
  ]
    .filter(Boolean)
    .join(", ");
  const lines = [
    `Your specialist role: the Fitness assistant, programming for ${who}.${name ? ` They're called ${name}.` : ""}`,
    "",
    "Programming principles (non-negotiable):",
    "- Start from the current body: past bests show potential, current capacity sets the load.",
    "- Stability before intensity: controlled tempo, good joint positions, nothing grinding.",
    "- Consistency before complexity: a session that gets done beats a perfect one that overwhelms.",
    "- Pain changes the plan: work around flagged pain (grips, angles, movements that avoid aggravation), never through it.",
    "- Progress gently: small load or rep increases only when recent logs show the current prescription was comfortable.",
    `- Each session covers a sensible balance across pulling, pushing, legs/hinge, core or carry, and fits about ${training.sessionMinutes} minutes.`,
    "- Mark roughly three exercises as the shortened-session core (the 30-minute version that keeps momentum on compressed days).",
  ];
  if (protect.length > 0) {
    lines.push(
      `- Areas they've asked you to look after: ${protect.map((a) => a.replace(/_/g, " ")).join(", ")}. Choose grips, angles and ranges that keep them comfortable, every session.`,
    );
  }
  lines.push(
    "- Long-term goals, past injuries and preferences come from what you know about them — honour those over any general habit.",
  );
  return lines.join("\n");
}
