import { cn } from "@/lib/utils";

/**
 * The unit mark — this product's one piece of visual signature.
 *
 * Every domain here counts a small number of discrete things, some
 * done and some not: sets logged, actions completed, sessions in a
 * fortnight, mobility tests out of ten. That's a training log's tally,
 * so it's drawn as a tally:
 * filled units against hollow ones, never a percentage bar.
 *
 * Colour follows the readiness signal (doc 12) and nothing else — a
 * mark is only tinted when the system means something by it.
 */
const TONE_FILL: Record<string, string> = {
  neutral: "bg-foreground",
  go: "bg-signal-go",
  ease: "bg-signal-ease",
  stop: "bg-signal-stop",
};

export function UnitMark({
  filled,
  total,
  tone = "neutral",
  label,
  className,
}: {
  filled: number;
  total: number;
  tone?: "neutral" | "go" | "ease" | "stop";
  /** Screen-reader description; the marks themselves are decorative. */
  label: string;
  className?: string;
}) {
  // Long counts collapse to a figure rather than a wall of ticks.
  const collapsed = total > 14;
  const safeTotal = Math.max(0, total);
  const safeFilled = Math.min(Math.max(0, filled), safeTotal);

  if (collapsed) {
    return (
      <span className={cn("figure text-xs text-muted-foreground", className)}>
        {safeFilled}
        <span className="opacity-50">/{safeTotal}</span>
        <span className="sr-only"> {label}</span>
      </span>
    );
  }

  return (
    <span
      className={cn("inline-flex items-center gap-[3px]", className)}
      role="img"
      aria-label={label}
    >
      {Array.from({ length: safeTotal }, (_, index) => (
        <span
          key={index}
          className={cn(
            "h-[4px] w-3.5 transition-colors",
            index < safeFilled ? TONE_FILL[tone] : "bg-foreground/22",
          )}
        />
      ))}
    </span>
  );
}
