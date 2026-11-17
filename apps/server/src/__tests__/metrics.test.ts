import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createFakeEmitter } from "../realtime/emitter";
import { createMetricsBroadcaster } from "../realtime/metrics-broadcaster";
import { bumpCacheVersion } from "../services/cache";
import { getMetrics } from "../services/metrics.service";
import { makeCart } from "./setup/fixtures";
import { createTestContext } from "./setup/test-app";

const ctx = createTestContext();
beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

const deps = () => ({ db: ctx.prisma, redis: ctx.redis });

/** A finished call on a cart, optionally ordered (which makes the cart RECOVERED). */
async function callOn(
  phone: string,
  opts: {
    answered?: boolean;
    sentiment?: "POSITIVE" | "NEUTRAL" | "NEGATIVE";
    order?: { totalPaise: number; createdAt?: Date };
    latencies?: number[];
  } = {},
) {
  const { cartId, customerId } = await makeCart(ctx.prisma, {
    phone,
    status: opts.order ? "RECOVERED" : "ABANDONED",
  });
  const call = await ctx.prisma.callLog.create({
    data: {
      cartId,
      customerId: customerId!,
      status: opts.answered === false ? "MISSED" : "ENDED",
      outcome: opts.order ? "RECOVERED" : "UNDECIDED",
      answeredAt: opts.answered === false ? null : new Date(),
      sentiment: opts.sentiment ?? null,
    },
  });
  for (const latencyMs of opts.latencies ?? []) {
    await ctx.prisma.transcriptTurn.create({
      data: { callId: call.id, speaker: "AGENT", text: "reply", latencyMs },
    });
  }
  if (opts.order) {
    await ctx.prisma.order.create({
      data: {
        cartId,
        subtotalPaise: opts.order.totalPaise,
        discountPaise: 0,
        totalPaise: opts.order.totalPaise,
        ...(opts.order.createdAt ? { createdAt: opts.order.createdAt } : {}),
      },
    });
  }
  return { cartId, callId: call.id };
}

describe("getMetrics", () => {
  it("is all zeros on an empty database, with no division by zero", async () => {
    const m = await getMetrics(deps());
    expect(m).toMatchObject({
      abandonedCarts: 0,
      callsPlaced: 0,
      answerRate: 0,
      recoveredCarts: 0,
      recoveryRate: 0,
      revenueRecoveredPaise: 0,
      avgLatencyMs: null,
      sentiment: { POSITIVE: 0, NEUTRAL: 0, NEGATIVE: 0 },
    });
  });

  it("works out recovery from abandoned carts and orders", async () => {
    await callOn("9000000001");
    await callOn("9000000002", { order: { totalPaise: 144810 } });
    const m = await getMetrics(deps());
    expect(m.abandonedCarts).toBe(2);
    expect(m.recoveredCarts).toBe(1);
    expect(m.recoveryRate).toBe(0.5);
    expect(m.revenueRecoveredPaise).toBe(144810);
  });

  it("counts only RECOVERED carts' orders as recovered revenue", async () => {
    await callOn("9000000001", { order: { totalPaise: 100000 } });
    const { cartId } = await makeCart(ctx.prisma, { phone: "9000000002", status: "COMPLETED" });
    await ctx.prisma.order.create({
      data: { cartId, subtotalPaise: 500000, discountPaise: 0, totalPaise: 500000 },
    });
    expect((await getMetrics(deps())).revenueRecoveredPaise).toBe(100000);
  });

  it("works out the answer rate, sentiment mix and average agent latency", async () => {
    await callOn("9000000001", { sentiment: "POSITIVE", latencies: [1000, 2000] });
    await callOn("9000000002", { sentiment: "NEGATIVE", latencies: [600] });
    await callOn("9000000003", { answered: false });
    await callOn("9000000004", { sentiment: "POSITIVE" });
    const m = await getMetrics(deps());
    expect(m.callsPlaced).toBe(4);
    expect(m.answerRate).toBe(0.75);
    expect(m.sentiment).toEqual({ POSITIVE: 2, NEUTRAL: 0, NEGATIVE: 1 });
    expect(m.avgLatencyMs).toBe(1200);
  });

  it("returns seven zero-filled days ending today, oldest first", async () => {
    const now = new Date("2026-11-17T10:00:00.000Z"); // 15:30 on the 17th in India
    await callOn("9000000001", {
      order: { totalPaise: 100000, createdAt: new Date("2026-11-17T08:00:00.000Z") },
    });
    await callOn("9000000002", {
      order: { totalPaise: 50000, createdAt: new Date("2026-11-14T08:00:00.000Z") },
    });
    const { last7Days } = await getMetrics({ ...deps(), now });
    expect(last7Days.map((d) => d.date)).toEqual([
      "2026-11-11",
      "2026-11-12",
      "2026-11-13",
      "2026-11-14",
      "2026-11-15",
      "2026-11-16",
      "2026-11-17",
    ]);
    expect(last7Days.map((d) => d.revenueRecoveredPaise)).toEqual([0, 0, 0, 50000, 0, 0, 100000]);
  });

  it("buckets days by the Indian calendar, not UTC", async () => {
    const now = new Date("2026-11-17T20:00:00.000Z"); // already the 18th in India
    // 19:00 UTC on the 17th is 00:30 on the 18th in India.
    await callOn("9000000001", {
      order: { totalPaise: 70000, createdAt: new Date("2026-11-17T19:00:00.000Z") },
    });
    const { last7Days } = await getMetrics({ ...deps(), now });
    expect(last7Days.at(-1)).toEqual({ date: "2026-11-18", revenueRecoveredPaise: 70000 });
    expect(last7Days.at(-2)?.revenueRecoveredPaise).toBe(0);
  });

  it("serves a cached copy until a write bumps the cache version", async () => {
    await callOn("9000000001");
    expect((await getMetrics(deps())).abandonedCarts).toBe(1);

    await callOn("9000000002"); // written straight to the database, no version bump
    expect((await getMetrics(deps())).abandonedCarts).toBe(1);

    await bumpCacheVersion(ctx.redis);
    expect((await getMetrics(deps())).abandonedCarts).toBe(2);
  });
});

describe("GET /api/dashboard/metrics", () => {
  it("returns the metrics", async () => {
    await callOn("9000000001", { order: { totalPaise: 144810 } });
    const res = await request(ctx.app).get("/api/dashboard/metrics");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ recoveredCarts: 1, revenueRecoveredPaise: 144810 });
    expect(res.body.last7Days).toHaveLength(7);
  });
});

describe("createMetricsBroadcaster", () => {
  it("emits fresh metrics to the dashboard once after a burst of changes (debounced)", async () => {
    const emitter = createFakeEmitter();
    const broadcaster = createMetricsBroadcaster({ ...deps(), emitter, debounceMs: 30 });
    await callOn("9000000001");
    await bumpCacheVersion(ctx.redis);

    broadcaster.schedule();
    broadcaster.schedule();
    broadcaster.schedule();
    expect(emitter.emissions).toHaveLength(0);

    await new Promise((r) => setTimeout(r, 150));
    expect(emitter.emissions).toHaveLength(1);
    expect(emitter.emissions[0]).toMatchObject({
      target: "dashboard",
      event: "dashboard:metrics",
      payload: { abandonedCarts: 1 },
    });
  });

  it("can be scheduled again after it has fired", async () => {
    const emitter = createFakeEmitter();
    const broadcaster = createMetricsBroadcaster({ ...deps(), emitter, debounceMs: 20 });
    broadcaster.schedule();
    await new Promise((r) => setTimeout(r, 100));
    broadcaster.schedule();
    await new Promise((r) => setTimeout(r, 100));
    expect(emitter.emissions).toHaveLength(2);
  });
});
