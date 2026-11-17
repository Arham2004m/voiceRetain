import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import { getCacheVersion } from "../services/cache";
import { scheduleAbandonmentCheck } from "../queue/abandonment.queue";
import { makeCart } from "./setup/fixtures";
import { createTestContext } from "./setup/test-app";

const ctx = createTestContext({ ABANDON_DELAY_MS: 30_000 });
beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

describe("demo config", () => {
  it("reports the delay and whether the mock LLM is on", async () => {
    const res = await request(ctx.app).get("/api/demo/config");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ abandonDelayMs: 30_000, mockLlm: true });
  });

  it("changes the delay at runtime", async () => {
    const put = await request(ctx.app).put("/api/demo/config").send({ abandonDelayMs: 12_000 });
    expect(put.status).toBe(200);
    expect(put.body.abandonDelayMs).toBe(12_000);
    expect((await request(ctx.app).get("/api/demo/config")).body.abandonDelayMs).toBe(12_000);
  });

  it("uses the new delay for the next checkout", async () => {
    await request(ctx.app).put("/api/demo/config").send({ abandonDelayMs: 7_000 });
    const { cartId } = await makeCart(ctx.prisma, { status: "ACTIVE" });
    await request(ctx.app)
      .post(`/api/carts/${cartId}/checkout`)
      .send({ name: "Rohan", phone: "9876543210", consentToCall: true });
    expect((await ctx.queue.getDelayed())[0]?.delay).toBe(7_000);
  });

  it.each([1000, 4999, 600001, "soon"])(
    "rejects a delay of %j with 400",
    async (abandonDelayMs) => {
      const res = await request(ctx.app).put("/api/demo/config").send({ abandonDelayMs });
      expect(res.status).toBe(400);
    },
  );
});

describe("POST /api/demo/trigger-latest", () => {
  it("returns 404 when no cart is waiting for a call", async () => {
    expect((await request(ctx.app).post("/api/demo/trigger-latest")).status).toBe(404);
  });

  it("runs the abandonment check now for the newest waiting cart", async () => {
    const older = await makeCart(ctx.prisma, { status: "CHECKOUT_STARTED", phone: "9000000001" });
    await new Promise((r) => setTimeout(r, 15));
    const newer = await makeCart(ctx.prisma, { status: "CHECKOUT_STARTED", phone: "9000000002" });
    await scheduleAbandonmentCheck(ctx.queue, older.cartId, 60_000);

    const res = await request(ctx.app).post("/api/demo/trigger-latest");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ cartId: newer.cartId });
    const waiting = await ctx.queue.getWaiting();
    expect(waiting.map((j) => j.id)).toEqual([`abandon-${newer.cartId}`]);
  });

  it("replaces a delayed job for that cart with an immediate one", async () => {
    const { cartId } = await makeCart(ctx.prisma, { status: "CHECKOUT_STARTED" });
    await scheduleAbandonmentCheck(ctx.queue, cartId, 60_000);
    await request(ctx.app).post("/api/demo/trigger-latest");
    expect(await ctx.queue.getDelayed()).toHaveLength(0);
    expect(await ctx.queue.getWaiting()).toHaveLength(1);
  });

  it("ignores carts that already finished checkout, were abandoned, or have no consent", async () => {
    await makeCart(ctx.prisma, { status: "ABANDONED", phone: "9000000001" });
    await makeCart(ctx.prisma, { status: "COMPLETED", phone: "9000000002" });
    await makeCart(ctx.prisma, { status: "CHECKOUT_STARTED", consent: false, phone: "9000000003" });
    expect((await request(ctx.app).post("/api/demo/trigger-latest")).status).toBe(404);
  });
});

describe("POST /api/demo/reset", () => {
  async function seedRows(isSeed: boolean, phone: string) {
    const { cartId, customerId } = await makeCart(ctx.prisma, { status: "ABANDONED", phone });
    await ctx.prisma.customer.update({ where: { id: customerId! }, data: { isSeed } });
    await ctx.prisma.cart.update({ where: { id: cartId }, data: { isSeed } });
    const call = await ctx.prisma.callLog.create({
      data: { cartId, customerId: customerId!, status: "ENDED", isSeed },
    });
    await ctx.prisma.transcriptTurn.create({
      data: { callId: call.id, speaker: "AGENT", text: "hi" },
    });
    const voucher = await ctx.prisma.voucher.create({
      data: {
        code: `VR-${isSeed ? "SEED" : "LIVE"}-${phone.slice(-4)}`.replace(/[01OIL]/g, "X"),
        percent: 10,
        cartId,
        callId: call.id,
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });
    await ctx.prisma.order.create({
      data: {
        cartId,
        voucherId: voucher.id,
        subtotalPaise: 100,
        discountPaise: 10,
        totalPaise: 90,
      },
    });
  }

  const counts = async () => ({
    customers: await ctx.prisma.customer.count(),
    carts: await ctx.prisma.cart.count(),
    cartItems: await ctx.prisma.cartItem.count(),
    calls: await ctx.prisma.callLog.count(),
    turns: await ctx.prisma.transcriptTurn.count(),
    vouchers: await ctx.prisma.voucher.count(),
    orders: await ctx.prisma.order.count(),
  });

  it("removes everything the demo created and keeps seed data and products", async () => {
    await seedRows(true, "9000000001");
    await seedRows(false, "9876543210");
    await seedRows(false, "9123456789");
    const products = await ctx.prisma.product.count();

    const res = await request(ctx.app).post("/api/demo/reset");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(await counts()).toEqual({
      customers: 1,
      carts: 1,
      cartItems: 1,
      calls: 1,
      turns: 1,
      vouchers: 1,
      orders: 1,
    });
    expect(await ctx.prisma.product.count()).toBe(products);
  });

  it("empties the queue and clears cached search and metrics results", async () => {
    await scheduleAbandonmentCheck(ctx.queue, "c1", 60_000);
    await ctx.redis.set("search:v3:rohan", "{}");
    await ctx.redis.set("metrics:v3", "{}");
    await ctx.redis.set("config:abandonDelayMs", "9000");

    await request(ctx.app).post("/api/demo/reset");

    expect(await ctx.queue.getDelayed()).toHaveLength(0);
    expect(await ctx.redis.exists("search:v3:rohan", "metrics:v3")).toBe(0);
    // The delay the presenter chose is a setting, not demo data.
    expect(await ctx.redis.get("config:abandonDelayMs")).toBe("9000");
  });

  it("bumps the cache version so nothing stale is served afterwards", async () => {
    await request(ctx.app).post("/api/demo/reset");
    expect(await getCacheVersion(ctx.redis)).toBeGreaterThan(0);
  });

  it("bumps the cache version after re-seeding, so no half-built picture is ever cached", async () => {
    let versionDuringSeed = -1;
    const reseed = async () => {
      versionDuringSeed = await getCacheVersion(ctx.redis);
    };
    const app = createApp({ ...ctx, demo: { reseed } });
    await request(app).post("/api/demo/reset");
    expect(await getCacheVersion(ctx.redis)).toBeGreaterThan(versionDuringSeed);
  });

  it("re-seeds history through the supplied hook and refreshes the dashboard", async () => {
    const reseed = vi.fn(async () => undefined);
    const schedule = vi.fn();
    const app = createApp({ ...ctx, metrics: { schedule }, demo: { reseed } });
    await request(app).post("/api/demo/reset");
    expect(reseed).toHaveBeenCalledTimes(1);
    expect(schedule).toHaveBeenCalled();
  });
});

describe("POST /api/demo/sync-catalogue", () => {
  it("refreshes the products and reports what happened", async () => {
    const syncCatalogue = vi.fn(async () => ({
      source: "dummyjson" as const,
      synced: 184,
      skipped: 0,
      retired: 6,
    }));
    const app = createApp({ ...ctx, demo: { syncCatalogue } });
    const res = await request(app).post("/api/demo/sync-catalogue");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ source: "dummyjson", synced: 184, skipped: 0, retired: 6 });
  });
});

describe("when DEMO_MODE is off", () => {
  it("does not expose the demo routes at all", async () => {
    const app = createApp({ ...ctx, env: { ...ctx.env, DEMO_MODE: false } });
    for (const [method, path] of [
      ["get", "/api/demo/config"],
      ["put", "/api/demo/config"],
      ["post", "/api/demo/trigger-latest"],
      ["post", "/api/demo/reset"],
      ["post", "/api/demo/sync-catalogue"],
    ] as const) {
      expect((await request(app)[method](path)).status).toBe(404);
    }
  });
});
