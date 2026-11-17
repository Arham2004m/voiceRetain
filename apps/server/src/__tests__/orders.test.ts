import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { issueVoucher } from "../vouchers/voucher.service";
import { getCacheVersion } from "../services/cache";
import { makeCart } from "./setup/fixtures";
import { createTestContext } from "./setup/test-app";

const ctx = createTestContext({ ABANDON_DELAY_MS: 30_000 });

beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

const complete = (cartId: string, voucherCode?: string) =>
  request(ctx.app)
    .post(`/api/carts/${cartId}/complete`)
    .send(voucherCode ? { voucherCode } : {});

async function abandonedWithAnsweredCall(opts: Parameters<typeof makeCart>[1] = {}) {
  const base = await makeCart(ctx.prisma, { status: "ABANDONED", ...opts });
  const call = await ctx.prisma.callLog.create({
    data: {
      cartId: base.cartId,
      customerId: base.customerId!,
      status: "ENDED",
      outcome: "ACCEPTED_OFFER",
      answeredAt: new Date(Date.now() - 60_000),
      endedAt: new Date(),
    },
  });
  return { ...base, callId: call.id };
}

const issue = async (cartId: string, callId: string, percent: number) => {
  const r = await issueVoucher(
    { db: ctx.prisma, redis: ctx.redis, env: ctx.env },
    { cartId, callId, requestedPercent: percent },
  );
  if (!r.ok) throw new Error("setup failed");
  return r.voucher.code;
};

describe("POST /api/carts/:id/complete", () => {
  it("completes without a voucher: cart COMPLETED, total includes shipping", async () => {
    const { cartId } = await makeCart(ctx.prisma, { status: "CHECKOUT_STARTED" });
    const res = await complete(cartId);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      cartId,
      subtotalPaise: 149900,
      discountPaise: 0,
      shippingPaise: 9900,
      totalPaise: 159800,
    });
    const cart = await ctx.prisma.cart.findUniqueOrThrow({ where: { id: cartId } });
    expect(cart.status).toBe("COMPLETED");
    expect(cart.completedAt).not.toBeNull();
  });

  it("removes the scheduled abandonment job", async () => {
    const { cartId } = await makeCart(ctx.prisma, { status: "ACTIVE" });
    const checkout = await request(ctx.app)
      .post(`/api/carts/${cartId}/checkout`)
      .send({ name: "Rohan", phone: "9876543210", consentToCall: true });
    expect(checkout.status).toBe(200);
    expect(await ctx.queue.getDelayed()).toHaveLength(1);

    expect((await complete(cartId)).status).toBe(200);
    expect(await ctx.queue.getDelayed()).toHaveLength(0);
  });

  it("applies a call-issued 10% voucher: cart RECOVERED, call RECOVERED, voucher REDEEMED", async () => {
    const { cartId, callId, customerId } = await abandonedWithAnsweredCall();
    const code = await issue(cartId, callId, 10);
    const res = await complete(cartId, code.toLowerCase());
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      discountPaise: 14990,
      totalPaise: 149900 - 14990 + 9900,
      voucherCode: code,
    });
    const [cart, call, voucher, customer] = await Promise.all([
      ctx.prisma.cart.findUniqueOrThrow({ where: { id: cartId } }),
      ctx.prisma.callLog.findUniqueOrThrow({ where: { id: callId } }),
      ctx.prisma.voucher.findUniqueOrThrow({ where: { code } }),
      ctx.prisma.customer.findUniqueOrThrow({ where: { id: customerId! } }),
    ]);
    expect(cart.status).toBe("RECOVERED");
    expect(call.outcome).toBe("RECOVERED");
    expect(voucher.status).toBe("REDEEMED");
    expect(voucher.redeemedAt).not.toBeNull();
    expect(customer.lifetimeValuePaise).toBe(res.body.totalPaise);
  });

  it("tells the dashboard the call changed", async () => {
    const { cartId, callId } = await abandonedWithAnsweredCall();
    await complete(cartId);
    const updates = ctx.emitter.emissions.filter((e) => e.event === "dashboard:call-updated");
    expect(updates.at(-1)?.payload).toMatchObject({ id: callId, outcome: "RECOVERED" });
  });

  it("does not credit the call when it was never answered", async () => {
    const { cartId, customerId } = await makeCart(ctx.prisma, { status: "ABANDONED" });
    const missed = await ctx.prisma.callLog.create({
      data: { cartId, customerId: customerId!, status: "MISSED", outcome: "NO_ANSWER" },
    });
    expect((await complete(cartId)).status).toBe(200);
    const cart = await ctx.prisma.cart.findUniqueOrThrow({ where: { id: cartId } });
    const call = await ctx.prisma.callLog.findUniqueOrThrow({ where: { id: missed.id } });
    expect(cart.status).toBe("COMPLETED");
    expect(call.outcome).toBe("NO_ANSWER");
  });

  it("rejects an expired voucher with 422 and changes nothing", async () => {
    const { cartId, callId } = await abandonedWithAnsweredCall();
    const code = await issue(cartId, callId, 10);
    await ctx.prisma.voucher.update({
      where: { code },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const res = await complete(cartId, code);
    expect(res.status).toBe(422);
    expect(res.body.error.details).toMatchObject({ reason: "EXPIRED" });
    expect(await ctx.prisma.order.count()).toBe(0);
    const cart = await ctx.prisma.cart.findUniqueOrThrow({ where: { id: cartId } });
    expect(cart.status).toBe("ABANDONED");
  });

  it("rejects another cart's voucher with 422", async () => {
    const a = await abandonedWithAnsweredCall();
    const code = await issue(a.cartId, a.callId, 10);
    const other = await makeCart(ctx.prisma, { status: "CHECKOUT_STARTED", phone: "9123456789" });
    const res = await complete(other.cartId, code);
    expect(res.status).toBe(422);
    expect(res.body.error.details).toMatchObject({ reason: "WRONG_CART" });
  });

  it("rejects an unknown code with 422 NOT_FOUND", async () => {
    const { cartId } = await makeCart(ctx.prisma, { status: "CHECKOUT_STARTED" });
    const res = await complete(cartId, "VR-NOPE-NOPE");
    expect(res.status).toBe(422);
    expect(res.body.error.details).toMatchObject({ reason: "NOT_FOUND" });
  });

  it("returns 409 on a second completion and creates one order only", async () => {
    const { cartId } = await makeCart(ctx.prisma, { status: "CHECKOUT_STARTED" });
    expect((await complete(cartId)).status).toBe(200);
    expect((await complete(cartId)).status).toBe(409);
    expect(await ctx.prisma.order.count()).toBe(1);
  });

  it("creates one order when completed concurrently", async () => {
    const { cartId } = await makeCart(ctx.prisma, { status: "CHECKOUT_STARTED" });
    const results = await Promise.all([complete(cartId), complete(cartId)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await ctx.prisma.order.count()).toBe(1);
  });

  it("returns 404 for an unknown cart and 422 for an empty cart", async () => {
    expect((await complete("nope")).status).toBe(404);
    const { cartId } = await makeCart(ctx.prisma, { status: "CHECKOUT_STARTED" });
    await ctx.prisma.cartItem.deleteMany({ where: { cartId } });
    const res = await complete(cartId);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("EMPTY_CART");
  });

  it("adds the order total to lifetime value on a normal order too", async () => {
    const { cartId, customerId } = await makeCart(ctx.prisma, { status: "CHECKOUT_STARTED" });
    const res = await complete(cartId);
    const customer = await ctx.prisma.customer.findUniqueOrThrow({ where: { id: customerId! } });
    expect(customer.lifetimeValuePaise).toBe(res.body.totalPaise);
  });

  it("bumps the cache version", async () => {
    const { cartId } = await makeCart(ctx.prisma, { status: "CHECKOUT_STARTED" });
    const before = await getCacheVersion(ctx.redis);
    await complete(cartId);
    expect(await getCacheVersion(ctx.redis)).toBeGreaterThan(before);
  });
});

describe("GET /api/orders/:id", () => {
  it("returns the order including the voucher code", async () => {
    const { cartId, callId } = await abandonedWithAnsweredCall();
    const code = await issue(cartId, callId, 15);
    const created = await complete(cartId, code);
    const res = await request(ctx.app).get(`/api/orders/${created.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: created.body.id,
      voucherCode: code,
      discountPaise: 22485,
    });
  });

  it("returns 404 for an unknown order", async () => {
    expect((await request(ctx.app).get("/api/orders/nope")).status).toBe(404);
  });
});
