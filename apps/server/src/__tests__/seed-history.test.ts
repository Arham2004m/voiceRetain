import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { computeTotals, VOUCHER_REGEX } from "@voiceretain/shared";
import { createApp } from "../app";
import { seedHistory } from "../seed/history";
import { seedProducts } from "../seed/products";
import { getMetrics } from "../services/metrics.service";
import { createTestContext } from "./setup/test-app";

const ctx = createTestContext();
const NOW = new Date("2026-11-17T12:00:00.000Z");
const DAY = 86_400_000;

beforeEach(async () => {
  await ctx.reset();
  await seedProducts(ctx.prisma);
});
afterAll(() => ctx.close());

const seed = (over: { now?: Date; rngSeed?: number } = {}) =>
  seedHistory(ctx.prisma, { now: NOW, rngSeed: 7, ...over });

describe("seedHistory", () => {
  it("creates exactly 20 calls with the PRD's outcome mix: 7 / 4 / 3 / 3 / 3", async () => {
    await seed();
    expect(await ctx.prisma.callLog.count()).toBe(20);
    const outcomes = await ctx.prisma.callLog.groupBy({ by: ["outcome"], _count: { _all: true } });
    const count = Object.fromEntries(outcomes.map((o) => [o.outcome, o._count._all]));
    expect(count).toEqual({
      RECOVERED: 7,
      ACCEPTED_OFFER: 4,
      UNDECIDED: 3,
      DECLINED: 3,
      NO_ANSWER: 3,
    });
  });

  it("flags everything it creates as seed data, and nothing else", async () => {
    await seed();
    expect(await ctx.prisma.customer.count({ where: { isSeed: false } })).toBe(0);
    expect(await ctx.prisma.cart.count({ where: { isSeed: false } })).toBe(0);
    expect(await ctx.prisma.callLog.count({ where: { isSeed: false } })).toBe(0);
    expect(await ctx.prisma.customer.count()).toBe(20);
  });

  it("uses the reserved phone range 9000000001 to 9000000020", async () => {
    await seed();
    const phones = (await ctx.prisma.customer.findMany({ select: { phone: true } }))
      .map((c) => c.phone)
      .sort();
    expect(phones[0]).toBe("9000000001");
    expect(phones[19]).toBe("9000000020");
  });

  it("only ever issues the allowed discount tiers, with well-formed codes", async () => {
    await seed();
    const vouchers = await ctx.prisma.voucher.findMany();
    expect(vouchers.length).toBeGreaterThan(8);
    for (const v of vouchers) {
      expect([5, 10, 15]).toContain(v.percent);
      expect(v.code).toMatch(VOUCHER_REGEX);
    }
    expect(new Set(vouchers.map((v) => v.code)).size).toBe(vouchers.length);
  });

  it("keeps vouchers consistent with the outcome: redeemed exactly when the order used one", async () => {
    await seed();
    const orders = await ctx.prisma.order.findMany({ include: { voucher: true } });
    for (const o of orders) {
      if (o.voucher) {
        expect(o.voucher.status).toBe("REDEEMED");
        expect(o.voucher.redeemedAt).not.toBeNull();
      }
    }
    expect(await ctx.prisma.voucher.count({ where: { status: "REDEEMED" } })).toBe(
      orders.filter((o) => o.voucherId).length,
    );
  });

  it("gives each recovered call an order whose figures add up, on a RECOVERED cart", async () => {
    await seed();
    const recovered = await ctx.prisma.callLog.findMany({
      where: { outcome: "RECOVERED" },
      include: { cart: { include: { order: { include: { voucher: true } } } } },
    });
    expect(recovered).toHaveLength(7);
    for (const call of recovered) {
      const { cart } = call;
      expect(cart.status).toBe("RECOVERED");
      const order = cart.order!;
      const expected = computeTotals(cart.subtotalPaise, order.voucher?.percent ?? 0);
      expect(order.subtotalPaise).toBe(expected.subtotalPaise);
      expect(order.discountPaise).toBe(expected.discountPaise);
      expect(order.totalPaise).toBe(expected.totalPaise);
    }
    expect(await ctx.prisma.order.count()).toBe(7);
  });

  it("credits recovered revenue to customers' lifetime value", async () => {
    await seed();
    const orders = await ctx.prisma.order.findMany({ include: { cart: true } });
    for (const o of orders) {
      const customer = await ctx.prisma.customer.findUniqueOrThrow({
        where: { id: o.cart.customerId! },
      });
      expect(customer.lifetimeValuePaise).toBe(o.totalPaise);
    }
  });

  it("spreads calls across the last 7 days, none in the future", async () => {
    await seed();
    const calls = await ctx.prisma.callLog.findMany();
    for (const c of calls) {
      expect(c.startedAt.getTime()).toBeLessThanOrEqual(NOW.getTime());
      expect(c.startedAt.getTime()).toBeGreaterThan(NOW.getTime() - 7 * DAY);
    }
    const days = new Set(
      calls.map((c) => Math.floor((NOW.getTime() - c.startedAt.getTime()) / DAY)),
    );
    expect(days.size).toBeGreaterThanOrEqual(6);
  });

  it("gives answered calls a 4 to 8 turn transcript and unanswered calls none", async () => {
    await seed();
    const calls = await ctx.prisma.callLog.findMany({ include: { turns: true } });
    for (const call of calls) {
      if (call.outcome === "NO_ANSWER") {
        expect(call.status).toBe("MISSED");
        expect(call.turns).toHaveLength(0);
        expect(call.summary).toBe("Customer did not speak.");
      } else {
        expect(call.status).toBe("ENDED");
        expect(call.turns.length).toBeGreaterThanOrEqual(4);
        expect(call.turns.length).toBeLessThanOrEqual(8);
        expect(call.turns[0]?.speaker).toBe("AGENT");
        expect(call.turns[0]?.text).toMatch(/^Hi \w+, this is Aria from ShopNest\./);
      }
    }
  });

  it("records agent latencies between 400 and 2500 ms, and an average that matches", async () => {
    await seed();
    const calls = await ctx.prisma.callLog.findMany({
      where: { status: "ENDED" },
      include: { turns: true },
    });
    for (const call of calls) {
      const agent = call.turns.filter((t) => t.speaker === "AGENT" && t.latencyMs !== null);
      expect(agent.length).toBeGreaterThan(0);
      for (const t of agent) {
        expect(t.latencyMs!).toBeGreaterThanOrEqual(400);
        expect(t.latencyMs!).toBeLessThanOrEqual(2500);
      }
      const mean = Math.round(agent.reduce((s, t) => s + t.latencyMs!, 0) / agent.length);
      expect(call.avgLatencyMs).toBe(mean);
      expect(call.durationSec).toBeGreaterThan(0);
    }
  });

  it("varies objections and sentiments", async () => {
    await seed();
    const calls = await ctx.prisma.callLog.findMany();
    expect(new Set(calls.map((c) => c.objection)).size).toBeGreaterThanOrEqual(5);
    expect(new Set(calls.map((c) => c.sentiment)).size).toBe(3);
    for (const c of calls) expect((c.summary ?? "").length).toBeLessThanOrEqual(200);
  });

  it("keeps transcripts and objections consistent with what was said", async () => {
    await seed();
    const shipping = await ctx.prisma.callLog.findMany({
      where: { objection: "SHIPPING_COST" },
      include: { turns: true },
    });
    expect(shipping.length).toBeGreaterThan(0);
    for (const c of shipping) {
      expect(c.turns.some((t) => t.speaker === "CUSTOMER" && /shipping/i.test(t.text))).toBe(true);
    }
  });

  it("is idempotent: running it again still leaves exactly 20 calls", async () => {
    await seed();
    await seed();
    expect(await ctx.prisma.callLog.count()).toBe(20);
    expect(await ctx.prisma.customer.count()).toBe(20);
    expect(await ctx.prisma.order.count()).toBe(7);
  });

  it("is reproducible: the same moment and seed give the same customers, codes and summaries", async () => {
    const snapshot = async () => {
      const customers = (await ctx.prisma.customer.findMany({ orderBy: { phone: "asc" } })).map(
        (c) => c.name,
      );
      const codes = (await ctx.prisma.voucher.findMany({ orderBy: { code: "asc" } })).map(
        (v) => v.code,
      );
      const summaries = (await ctx.prisma.callLog.findMany({ orderBy: { startedAt: "asc" } })).map(
        (c) => c.summary,
      );
      return { customers, codes, summaries };
    };
    await seed();
    const first = await snapshot();
    await seed();
    expect(await snapshot()).toEqual(first);
  });

  it("gives different data for a different seed", async () => {
    await seed({ rngSeed: 1 });
    const a = (await ctx.prisma.voucher.findMany({ orderBy: { code: "asc" } })).map((v) => v.code);
    await seed({ rngSeed: 2 });
    const b = (await ctx.prisma.voucher.findMany({ orderBy: { code: "asc" } })).map((v) => v.code);
    expect(a).not.toEqual(b);
  });

  it("leaves demo data (anything not seed) alone", async () => {
    const live = await ctx.prisma.customer.create({
      data: { name: "Live Demo", phone: "9876543210" },
    });
    await seed();
    await seed();
    expect(await ctx.prisma.customer.findUnique({ where: { id: live.id } })).not.toBeNull();
  });

  it("only uses products that are on sale", async () => {
    await ctx.prisma.product.updateMany({
      where: { slug: { not: "wireless-earbuds-pro" } },
      data: { active: false },
    });
    await seed();
    const items = await ctx.prisma.cartItem.findMany({ include: { product: true } });
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.product.slug === "wireless-earbuds-pro")).toBe(true);
  });

  it("explains itself when there are no products to build carts from", async () => {
    await ctx.prisma.product.updateMany({ data: { active: false } });
    await expect(seed()).rejects.toThrow(/no products/i);
  });

  it("produces figures the dashboard can use: 20 abandoned, 7 recovered, 85% answered", async () => {
    await seed();
    const m = await getMetrics({ db: ctx.prisma, redis: ctx.redis, now: NOW });
    expect(m).toMatchObject({
      abandonedCarts: 20,
      callsPlaced: 20,
      recoveredCarts: 7,
      answerRate: 0.85,
    });
    expect(m.recoveryRate).toBeCloseTo(0.35);
    expect(m.revenueRecoveredPaise).toBeGreaterThan(0);
    expect(m.avgLatencyMs).toBeGreaterThanOrEqual(400);
    expect(m.last7Days.filter((d) => d.revenueRecoveredPaise > 0).length).toBeGreaterThanOrEqual(4);
  });
});

describe("reset with the seed hook", () => {
  it("clears demo data and brings the 20 seeded calls back", async () => {
    const app = createApp({ ...ctx, demo: { reseed: () => seedHistory(ctx.prisma) } });
    const live = await ctx.prisma.customer.create({
      data: { name: "Live Demo", phone: "9876543210" },
    });
    await request(app).post("/api/demo/reset").expect(200);
    expect(await ctx.prisma.customer.findUnique({ where: { id: live.id } })).toBeNull();
    expect(await ctx.prisma.callLog.count()).toBe(20);
  });
});
