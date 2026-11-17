import type { DashboardMetrics } from "@voiceretain/shared";
import type { Redis } from "ioredis";
import type { Db } from "../db/prisma";
import { getCacheVersion } from "./cache";

const DAY_MS = 86_400_000;
const CACHE_TTL_SECONDS = 10;

// The merchant is in India: a "day" on the chart is an Indian calendar day (UTC+5:30, no DST).
const indiaDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export interface MetricsDeps {
  db: Db;
  redis: Redis;
  /** Only for tests; passing it skips the cache so the result matches the given moment. */
  now?: Date;
}

const ratio = (part: number, whole: number) => (whole === 0 ? 0 : part / whole);

async function compute(db: Db, now: Date): Promise<DashboardMetrics> {
  const windowStart = new Date(now.getTime() - 8 * DAY_MS);
  const [
    abandonedCarts,
    callsPlaced,
    answeredCalls,
    recoveredCarts,
    revenue,
    latency,
    sentimentGroups,
    recentOrders,
  ] = await Promise.all([
    db.cart.count({ where: { status: { in: ["ABANDONED", "RECOVERED"] } } }),
    db.callLog.count(),
    db.callLog.count({ where: { answeredAt: { not: null } } }),
    db.cart.count({ where: { status: "RECOVERED" } }),
    db.order.aggregate({ _sum: { totalPaise: true }, where: { cart: { status: "RECOVERED" } } }),
    db.transcriptTurn.aggregate({
      _avg: { latencyMs: true },
      where: { speaker: "AGENT", latencyMs: { not: null } },
    }),
    db.callLog.groupBy({
      by: ["sentiment"],
      _count: { _all: true },
      where: { sentiment: { not: null } },
    }),
    db.order.findMany({
      where: { cart: { status: "RECOVERED" }, createdAt: { gte: windowStart } },
      select: { totalPaise: true, createdAt: true },
    }),
  ]);

  const sentiment = { POSITIVE: 0, NEUTRAL: 0, NEGATIVE: 0 };
  for (const group of sentimentGroups) {
    if (group.sentiment) sentiment[group.sentiment] = group._count._all;
  }

  const byDay = new Map<string, number>();
  for (const order of recentOrders) {
    const day = indiaDay.format(order.createdAt);
    byDay.set(day, (byDay.get(day) ?? 0) + order.totalPaise);
  }
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const date = indiaDay.format(new Date(now.getTime() - (6 - i) * DAY_MS));
    return { date, revenueRecoveredPaise: byDay.get(date) ?? 0 };
  });

  return {
    abandonedCarts,
    callsPlaced,
    answerRate: ratio(answeredCalls, callsPlaced),
    recoveredCarts,
    recoveryRate: ratio(recoveredCarts, abandonedCarts),
    revenueRecoveredPaise: revenue._sum.totalPaise ?? 0,
    avgLatencyMs: latency._avg.latencyMs === null ? null : Math.round(latency._avg.latencyMs),
    sentiment,
    last7Days,
  };
}

/** PRD §10.3: cached for 10 s under a key that carries the global cache version. */
export async function getMetrics({ db, redis, now }: MetricsDeps): Promise<DashboardMetrics> {
  if (now) return compute(db, now);

  const key = `metrics:v${await getCacheVersion(redis)}`;
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached) as DashboardMetrics;

  const metrics = await compute(db, new Date());
  await redis.set(key, JSON.stringify(metrics), "EX", CACHE_TTL_SECONDS);
  return metrics;
}
