import { asc, desc, eq, gte, sql } from "drizzle-orm";
import { getDb } from "../db";
import { metrics, workouts } from "../schema";
import {
  isMetricKind,
  METRIC_SPECS,
  summariseTrend,
  validateMetric,
  type MetricKind,
  type MetricPoint,
  type MetricTrend,
} from "../../domain/metrics";

export type Metric = typeof metrics.$inferSelect;

/**
 * One reading per metric per day: re-entering the same day corrects the
 * earlier value rather than stacking duplicates.
 */
export async function recordMetric(input: {
  date: string;
  kind: MetricKind;
  value: number;
  note?: string | null;
}): Promise<Metric> {
  if (!isMetricKind(input.kind)) {
    throw new Error(`Unknown metric: ${input.kind}`);
  }
  const problem = validateMetric(input.kind, input.value);
  if (problem) throw new RangeError(problem);

  const db = await getDb();
  const [row] = await db
    .insert(metrics)
    .values({
      date: input.date,
      kind: input.kind,
      value: input.value,
      unit: METRIC_SPECS[input.kind].unit,
      note: input.note ?? null,
    })
    .onConflictDoUpdate({
      target: [metrics.kind, metrics.date],
      set: {
        value: input.value,
        note: input.note ?? null,
        createdAt: new Date(),
      },
    })
    .returning();
  return row;
}

export async function listMetrics(kind?: MetricKind): Promise<Metric[]> {
  const db = await getDb();
  const query = db.select().from(metrics);
  const rows = kind
    ? await query.where(eq(metrics.kind, kind)).orderBy(asc(metrics.date))
    : await query.orderBy(asc(metrics.date));
  return rows;
}

/** Oldest-to-newest trend per metric, ready for the progress view. */
export async function getMetricTrends(): Promise<
  Partial<Record<MetricKind, MetricTrend>>
> {
  const rows = await listMetrics();
  const points = new Map<MetricKind, MetricPoint[]>();
  for (const row of rows) {
    if (!isMetricKind(row.kind)) continue;
    const list = points.get(row.kind) ?? [];
    list.push({ date: row.date, value: row.value });
    points.set(row.kind, list);
  }

  const trends: Partial<Record<MetricKind, MetricTrend>> = {};
  for (const [kind, list] of points) {
    const trend = summariseTrend(kind, list);
    if (trend) trends[kind] = trend;
  }
  return trends;
}

/** Completed sessions on or after `sinceDate` — the consistency signal. */
export async function countCompletedWorkoutsSince(
  sinceDate: string,
): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(workouts)
    .where(
      sql`${workouts.status} = 'completed' and ${gte(workouts.date, sinceDate)}`,
    );
  return row?.count ?? 0;
}

export async function getLatestMetric(kind: MetricKind): Promise<Metric | null> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(metrics)
    .where(eq(metrics.kind, kind))
    .orderBy(desc(metrics.date))
    .limit(1);
  return row ?? null;
}

export async function getRecentMetrics(limit = 10): Promise<Metric[]> {
  const db = await getDb();
  return db
    .select()
    .from(metrics)
    .orderBy(desc(metrics.date), desc(metrics.createdAt))
    .limit(limit);
}
