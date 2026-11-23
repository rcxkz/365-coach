import Link from "next/link";
import { ArrowLeft, Check, Minus, TrendingDown, TrendingUp } from "lucide-react";
import { saveMetric } from "./actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  countCompletedWorkoutsSince,
  getLatestMetric,
  getMetricTrends,
} from "@/data/repos/metrics";
import { listOpenPainFlags } from "@/data/repos/pain";
import { evaluateBlock1, type CriterionStatus } from "@/domain/block1";
import { addDaysISO, todayInTimeZone } from "@/domain/dates";
import {
  METRIC_KINDS,
  METRIC_SPECS,
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

export default async function ProgressPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const today = todayInTimeZone();

  const [trends, recentSessions, openPain, latestMobility] = await Promise.all([
    getMetricTrends(),
    countCompletedWorkoutsSince(addDaysISO(today, -14)),
    listOpenPainFlags(),
    getLatestMetric("mobility_score"),
  ]);

  const block1 = evaluateBlock1({
    trends,
    recentSessions,
    openPain: openPain.map((flag) => ({
      location: flag.location,
      severity: flag.severity,
    })),
  });

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
          Block 1 — Rebuild. Numbers when you have them; nothing here is owed.
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

      <section className="mb-8">
        <h2 className="eyebrow mb-3">
          Ready for Block 2 when
        </h2>
        <ul className="flex flex-col gap-3">
          {block1.criteria.map((criterion) => (
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
        <p className="mt-3 text-xs text-muted-foreground">
          {block1.ready
            ? "Everything's pointing the right way — worth talking about Block 2."
            : `${block1.metCount} of ${block1.total} in place. Block 1 runs 6–8 weeks; there's no rush on it.`}
        </p>
      </section>

      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="eyebrow">
            Mobility
          </h2>
          <Link
            href="/progress/mobility"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Take the 5-minute check
          </Link>
        </div>
        <TrendNote trend={trends.mobility_score} />
        {latestMobility?.note && (
          <p className="mt-1 text-xs text-muted-foreground">
            {latestMobility.note}
          </p>
        )}
      </section>

      <section>
        <h2 className="eyebrow mb-3">
          Record a number
        </h2>
        <ul className="flex flex-col gap-3">
          {METRIC_KINDS.filter((kind) => kind !== "mobility_score").map(
            (kind) => {
              const spec = METRIC_SPECS[kind];
              return (
                <li key={kind}>
                  <Card className="py-0">
                    <CardContent className="p-4">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-sm font-medium">{spec.label}</p>
                        <TrendNote trend={trends[kind]} />
                      </div>
                      {spec.hint && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {spec.hint}
                        </p>
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
                          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                        />
                        <Button type="submit" variant="outline" size="sm">
                          Save
                        </Button>
                      </form>
                    </CardContent>
                  </Card>
                </li>
              );
            },
          )}
        </ul>
      </section>
    </main>
  );
}
