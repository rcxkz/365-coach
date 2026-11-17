import Link from "next/link";
import { recordDetailedCheckin, recordFeelingGood } from "@/app/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import type { DailyCheckin } from "@/data/repos/checkins";
import type { PainFlag } from "@/data/repos/pain";
import { cn } from "@/lib/utils";
import { BODY_AREAS } from "@/domain/exercises";
import type { CurrentFeeling } from "@/domain/journal";
import { assessReadiness } from "@/domain/readiness";

const LEVEL_DOT: Record<string, string> = {
  green: "bg-signal-go",
  yellow: "bg-signal-ease",
  red: "bg-signal-stop",
};

const LEVEL_HEADLINE: Record<string, string> = {
  green: "Checked in — all clear.",
  yellow: "Noted — worth going a touch easier today.",
  red: "Recovery is the smart move today.",
};

function RadioChips({
  name,
  options,
  current,
}: {
  name: string;
  options: { value: string; label: string }[];
  current: string;
}) {
  return (
    <div className="flex gap-2">
      {options.map((option) => (
        <label key={option.value}>
          <input
            type="radio"
            name={name}
            value={option.value}
            defaultChecked={current === option.value}
            className="peer sr-only"
          />
          <span className="inline-flex cursor-pointer items-center rounded-md border border-input bg-background px-3 py-1.5 text-sm transition-colors peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground">
            {option.label}
          </span>
        </label>
      ))}
    </div>
  );
}

function formatArea(area: string): string {
  return area.replace(/_/g, " ");
}

/**
 * Check-in v2 (Phase 2 design §2): one tap on a normal day, detail only
 * when something's off. Pain entries write to pain_flags — one pain
 * system. Zero client JS: native radios + server actions.
 */
export function CheckinPrompt({
  checkin,
  painFlags,
  detail,
  feeling,
}: {
  checkin: DailyCheckin | null;
  painFlags: PainFlag[];
  detail: boolean;
  /** Latest journal signals, so the headline matches the plan. */
  feeling?: CurrentFeeling;
}) {
  if (detail) {
    return (
      <form
        action={recordDetailedCheckin}
        className="flex flex-col gap-4 rounded-lg border p-4"
      >
        <div className="flex flex-col gap-1.5">
          <span className="text-sm text-muted-foreground">Sleep</span>
          <RadioChips
            name="sleep"
            current={checkin?.sleep ?? "normal"}
            options={[
              { value: "poor", label: "Poor" },
              { value: "normal", label: "Normal" },
              { value: "good", label: "Good" },
            ]}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm text-muted-foreground">Energy</span>
          <RadioChips
            name="energy"
            current={checkin?.energy ?? "normal"}
            options={[
              { value: "low", label: "Low" },
              { value: "normal", label: "Normal" },
              { value: "high", label: "High" },
            ]}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm text-muted-foreground">Soreness</span>
          <RadioChips
            name="soreness"
            current={checkin?.soreness ?? "none"}
            options={[
              { value: "none", label: "None" },
              { value: "mild", label: "Mild" },
              { value: "heavy", label: "Heavy" },
            ]}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm text-muted-foreground">Any pain?</span>
          <select
            name="painArea"
            defaultValue=""
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">No new pain</option>
            {BODY_AREAS.map((area) => (
              <option key={area} value={area}>
                {formatArea(area)}
              </option>
            ))}
          </select>
          <RadioChips
            name="painSeverity"
            current="mild"
            options={[
              { value: "mild", label: "Mild" },
              { value: "moderate", label: "Moderate" },
              { value: "severe", label: "Severe" },
            ]}
          />
          {painFlags.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Already tracking:{" "}
              {painFlags
                .map((flag) => `${formatArea(flag.location)} (${flag.severity}/5)`)
                .join(", ")}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button type="submit" className="flex-1">
            Save check-in
          </Button>
          <Link
            href="/"
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            Cancel
          </Link>
        </div>
        <Link
          href="/?pause=choose"
          className="text-center text-xs text-muted-foreground underline-offset-4 hover:underline"
        >
          Actually unwell? Pause training instead
        </Link>
      </form>
    );
  }

  if (checkin) {
    const readiness = assessReadiness(checkin, painFlags, feeling);
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
        <div className="flex items-start gap-2.5">
          <span
            className={cn(
              "mt-1.5 h-2 w-2 shrink-0 rounded-full",
              LEVEL_DOT[readiness.level],
            )}
          />
          <div>
            <p className="text-sm">{LEVEL_HEADLINE[readiness.level]}</p>
            {readiness.reasons.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {readiness.reasons.join(" ")}
              </p>
            )}
          </div>
        </div>
        <Link
          href="/?checkin=detail"
          className="shrink-0 text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          Adjust
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="mr-1 text-sm text-muted-foreground">
        How are you feeling?
      </span>
      <form action={recordFeelingGood} className="contents">
        <Button type="submit" size="sm">
          Feeling good
        </Button>
      </form>
      <Link
        href="/?checkin=detail"
        className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
      >
        Something&apos;s off
      </Link>
    </div>
  );
}
