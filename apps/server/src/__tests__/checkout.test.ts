import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import { bumpCacheVersion, getCacheVersion } from "../services/cache";
import { seedProducts } from "../seed/products";
import { createTestContext } from "./setup/test-app";

const ctx = createTestContext({ ABANDON_DELAY_MS: 30_000 });

beforeEach(async () => {
  await ctx.reset();
  await seedProducts(ctx.prisma);
});
afterAll(() => ctx.close());

const earbudsId = async () =>
  (await ctx.prisma.product.findUniqueOrThrow({ where: { slug: "wireless-earbuds-pro" } })).id;

async function newCart() {
  const res = await request(ctx.app)
    .post("/api/carts")
    .send({ items: [{ productId: await earbudsId(), quantity: 1 }] });
  return res.body.id as string;
}

const body = (over: Record<string, unknown> = {}) => ({
  name: "Rohan",
  phone: "9876543210",
  consentToCall: true,
  ...over,
});

describe("POST /api/carts/:id/checkout", () => {
  it("creates the customer, marks the cart CHECKOUT_STARTED and schedules one delayed job", async () => {
    const cartId = await newCart();
    const res = await request(ctx.app).post(`/api/carts/${cartId}/checkout`).send(body());
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("CHECKOUT_STARTED");
    expect(res.body.customer).toEqual({ name: "Rohan", phone: "9876543210" });
    const delayed = await ctx.queue.getDelayed();
    expect(delayed).toHaveLength(1);
    expect(delayed[0]?.id).toBe(`abandon-${cartId}`);
    expect(delayed[0]?.delay).toBe(30_000);
    const cart = await ctx.prisma.cart.findUniqueOrThrow({ where: { id: cartId } });
    expect(cart.checkoutStartedAt).not.toBeNull();
  });

  it("is idempotent: a second checkout keeps one job and updates the customer name", async () => {
    const cartId = await newCart();
    await request(ctx.app).post(`/api/carts/${cartId}/checkout`).send(body());
    await request(ctx.app)
      .post(`/api/carts/${cartId}/checkout`)
      .send(body({ name: "Rohan Mehta" }));
    expect(await ctx.queue.getDelayed()).toHaveLength(1);
    expect(await ctx.prisma.customer.count()).toBe(1);
    const customer = await ctx.prisma.customer.findUniqueOrThrow({
      where: { phone: "9876543210" },
    });
    expect(customer.name).toBe("Rohan Mehta");
  });

  it("schedules nothing without consent", async () => {
    const cartId = await newCart();
    const res = await request(ctx.app)
      .post(`/api/carts/${cartId}/checkout`)
      .send(body({ consentToCall: false }));
    expect(res.status).toBe(200);
    expect(await ctx.queue.getDelayed()).toHaveLength(0);
  });

  it("cancels a pending job when consent is withdrawn on a later checkout", async () => {
    const cartId = await newCart();
    await request(ctx.app).post(`/api/carts/${cartId}/checkout`).send(body());
    await request(ctx.app)
      .post(`/api/carts/${cartId}/checkout`)
      .send(body({ consentToCall: false }));
    expect(await ctx.queue.getDelayed()).toHaveLength(0);
  });

  it("rejects an empty cart with 422 EMPTY_CART", async () => {
    const cartId = await newCart();
    await request(ctx.app).put(`/api/carts/${cartId}/items`).send({ items: [] });
    const res = await request(ctx.app).post(`/api/carts/${cartId}/checkout`).send(body());
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("EMPTY_CART");
  });

  it("allows checkout on an ABANDONED cart and reschedules", async () => {
    const cartId = await newCart();
    await ctx.prisma.cart.update({ where: { id: cartId }, data: { status: "ABANDONED" } });
    const res = await request(ctx.app).post(`/api/carts/${cartId}/checkout`).send(body());
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("CHECKOUT_STARTED");
    expect(await ctx.queue.getDelayed()).toHaveLength(1);
  });

  it("returns 409 for a completed cart and 404 for an unknown cart", async () => {
    const cartId = await newCart();
    await ctx.prisma.cart.update({ where: { id: cartId }, data: { status: "COMPLETED" } });
    expect((await request(ctx.app).post(`/api/carts/${cartId}/checkout`).send(body())).status).toBe(
      409,
    );
    expect((await request(ctx.app).post("/api/carts/nope/checkout").send(body())).status).toBe(404);
  });

  it("rejects an invalid phone with 400", async () => {
    const cartId = await newCart();
    const res = await request(ctx.app)
      .post(`/api/carts/${cartId}/checkout`)
      .send(body({ phone: "12345" }));
    expect(res.status).toBe(400);
  });

  it("bumps the cache version when it writes a customer", async () => {
    const before = await getCacheVersion(ctx.redis);
    const cartId = await newCart();
    await request(ctx.app).post(`/api/carts/${cartId}/checkout`).send(body());
    expect(await getCacheVersion(ctx.redis)).toBeGreaterThan(before);
  });

  it("rate limits to 20 requests per minute per IP", async () => {
    const app = createApp(ctx);
    const cartId = await newCart();
    let last = 0;
    for (let i = 0; i < 21; i++) {
      last = (await request(app).post(`/api/carts/${cartId}/checkout`).send(body())).status;
    }
    expect(last).toBe(429);
  });
});

describe("POST /api/cart-abandoned", () => {
  it("creates a cart and schedules the check, returning scheduledInMs", async () => {
    const res = await request(ctx.app)
      .post("/api/cart-abandoned")
      .send({
        customer: { name: "Rohan", phone: "9876543210", consentToCall: true },
        items: [{ productId: await earbudsId(), quantity: 1 }],
      });
    expect(res.status).toBe(200);
    expect(res.body.scheduledInMs).toBe(30_000);
    expect(await ctx.queue.getDelayed()).toHaveLength(1);
    const cart = await ctx.prisma.cart.findUniqueOrThrow({ where: { id: res.body.cartId } });
    expect(cart.status).toBe("CHECKOUT_STARTED");
  });

  it("rejects an empty items list with 400", async () => {
    const res = await request(ctx.app)
      .post("/api/cart-abandoned")
      .send({ customer: { name: "Rohan", phone: "9876543210", consentToCall: true }, items: [] });
    expect(res.status).toBe(400);
  });
});

describe("cache version", () => {
  it("starts at 0 and increments", async () => {
    expect(await getCacheVersion(ctx.redis)).toBe(0);
    await bumpCacheVersion(ctx.redis);
    await bumpCacheVersion(ctx.redis);
    expect(await getCacheVersion(ctx.redis)).toBe(2);
  });
});
