import Link from "next/link";
import { ArrowLeft, Check, ChevronDown, Minus, TrendingDown, TrendingUp } from "lucide-react";
import { saveMetric } from "./actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Fold } from "@/components/fold";
import {
  countCompletedWorkoutsSince,
  getLatestMetric,
  getMetricTrends,
} from "@/data/repos/metrics";
import { listOpenPainFlags } from "@/data/repos/pain";
import { getProfile } from "@/data/repos/profile";
import type { PlanStyle } from "@/domain/templates";
import { evaluateBlock1, type CriterionStatus } from "@/domain/block1";
import { addDaysISO, todayInTimeZone } from "@/domain/dates";
import {
  METRIC_KINDS,
  METRIC_SPECS,
  type MetricKind,
  type MetricTrend,
} from "@/domain/metrics";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata = { title: "Progress" };

const STATUS_STYLE: Record<CriterionStatus, string> = {
  met: "bg-signal-go",
  building: "bg-signal-ease",
  unknown: "bg-muted-foreground/40",
};

function TrendNote({ trend }: { trend: MetricTrend | undefined }) {
  if (!trend) {
    return <span className="text-xs text-muted-foreground">Not recorded</span>;
  }
  const spec = METRIC_SPECS[trend.kind];
  if (trend.change === null) {
    return (
      <span className="text-xs text-muted-foreground">
        {trend.latest.value} {spec.unit} · baseline
      </span>
    );
  }
  const Icon =
    trend.change > 0 ? TrendingUp : trend.change < 0 ? TrendingDown : Minus;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs",
        trend.improving === true
          ? "text-foreground"
          : "text-muted-foreground",
      )}
    >
      {trend.latest.value} {spec.unit}
      <Icon className="h-3 w-3" />
      {trend.change > 0 ? "+" : ""}
      {trend.change} since {trend.first.date}
    </span>
  );
}

const BLOCK_PLANS = new Set<PlanStyle>(["rebuild", "calisthenics"]);
const UNIVERSAL_CRITERIA = new Set(["consistency", "pain"]);
const BLOCK_ONLY_METRICS = new Set<MetricKind>(["pullup_max", "weighted_pullup", "dip_max", "weighted_dip", "dead_hang"]);

export default async function ProgressPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const today = todayInTimeZone();

  const [trends, recentSessions, openPain, latestMobility, { profile }] = await Promise.all([
    getMetricTrends(),
    countCompletedWorkoutsSince(addDaysISO(today, -14)),
    listOpenPainFlags(),
    getLatestMetric("mobility_score"),
    getProfile(),
  ]);
  // The Block 1 → Block 2 checklist belongs to the Rebuild and
  // Calisthenics plans it was written for. Other plans see the parts
  // that fit everyone, and only the numbers that suit them.
  const blockPlan = BLOCK_PLANS.has(profile.training.plan);

  const block1 = evaluateBlock1({
    trends,
    recentSessions,
    openPain: openPain.map((flag) => ({
      location: flag.location,
      severity: flag.severity,
    })),
  });

  const criteria = blockPlan
    ? block1.criteria
    : block1.criteria.filter((criterion) => UNIVERSAL_CRITERIA.has(criterion.id));

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-8">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Today
      </Link>

      <header className="mt-4 mb-6">
        <h1 className="text-[1.75rem] font-normal leading-none">Progress</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {blockPlan ? "Block 1 — Rebuild. " : ""}Numbers when you have them; nothing here is owed.
        </p>
      </header>

      {saved && (
        <p className="mb-4 rounded-lg bg-secondary p-3 text-sm">
          Saved. {saved === "mobility_score" ? "Retest in about a month." : ""}
        </p>
      )}
      {error && (
        <p className="mb-4 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          That value looked out of range, so nothing was saved — worth another
          go.
        </p>
      )}

      {/* Folded sections (Phase 18): one open, the rest a tap away, so
          the tab doesn't open on a wall of forms. Each closed heading
          still says what's inside. */}
      <Fold
        open
        title={blockPlan ? "Ready for Block 2 when" : "Going well when"}
        aside={`${criteria.filter((c) => c.status === "met").length} of ${criteria.length}`}
      >
        <ul className="flex flex-col gap-3">
          {criteria.map((criterion) => (
            <li key={criterion.id} className="flex gap-2.5">
              <span
                className={cn(
                  "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                  STATUS_STYLE[criterion.status],
                )}
              />
              <div>
                <p className="text-sm font-medium">
                  {criterion.label}
                  {criterion.status === "met" && (
                    <Check className="ml-1 inline h-3.5 w-3.5 text-foreground" />
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {criterion.detail}
                </p>
              </div>
            </li>
          ))}
        </ul>
        {blockPlan && (
          <p className="mt-3 text-xs text-muted-foreground">
            {block1.ready
              ? "Everything's pointing the right way — worth talking about Block 2."
              : `${block1.metCount} of ${block1.total} in place. Block 1 runs 6–8 weeks; there's no rush on it.`}
          </p>
        )}
      </Fold>

      <Fold title="Mobility" aside={<TrendNote trend={trends.mobility_score} />}>
        {latestMobility?.note && (
          <p className="mb-3 text-xs text-muted-foreground">{latestMobility.note}</p>
        )}
        <p className="mb-3 text-sm text-muted-foreground">
          Five tests, one per area. About five minutes, and monthly is plenty.
        </p>
        <Link
          href="/progress/mobility"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          Take the 5-minute check
        </Link>
      </Fold>

      <Fold
        title="Record a number"
        aside={`${METRIC_KINDS.filter(
            (kind) => kind !== "mobility_score" && (blockPlan || !BLOCK_ONLY_METRICS.has(kind)),
          ).filter((kind) => trends[kind]).length} tracked`}
        className="border-b"
      >
        <ul className="flex flex-col divide-y divide-border border-y border-border">
          {METRIC_KINDS.filter(
            (kind) => kind !== "mobility_score" && (blockPlan || !BLOCK_ONLY_METRICS.has(kind)),
          ).map((kind) => {
            const spec = METRIC_SPECS[kind];
            return (
              <li key={kind}>
                {/* Each number opens on its own: a list of names, not a stack of forms. */}
                <details className="group/metric">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-3 [&::-webkit-details-marker]:hidden">
                    <span className="text-sm">{spec.label}</span>
                    <span className="flex items-center gap-2">
                      <TrendNote trend={trends[kind]} />
                      <ChevronDown aria-hidden className="h-4 w-4 text-muted-foreground transition-transform group-open/metric:rotate-180" />
                    </span>
                  </summary>
                  <div className="pb-4">
                    {spec.hint && (
                      <p className="text-xs text-muted-foreground">{spec.hint}</p>
                    )}
                    <form action={saveMetric} className="mt-2 flex gap-2">
                      <input type="hidden" name="kind" value={kind} />
                      <input
                        type="number"
                        name="value"
                        step={spec.step}
                        min={spec.min}
                        max={spec.max}
                        inputMode="decimal"
                        placeholder={spec.unit}
                        aria-label={`${spec.label} in ${spec.unit}`}
                        className="h-10 w-full border border-input bg-background px-3 text-sm"
                      />
                      <Button type="submit" variant="outline" className="h-10">
                        Save
                      </Button>
                    </form>
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      </Fold>
    </main>
  );
}
