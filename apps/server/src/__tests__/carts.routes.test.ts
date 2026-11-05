import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createTestContext } from "./setup/test-app";
import { seedProducts } from "../seed/products";

const ctx = createTestContext();

beforeEach(async () => {
  await ctx.reset();
  await seedProducts(ctx.prisma);
});
afterAll(() => ctx.close());

const earbudsId = async () =>
  (await ctx.prisma.product.findUniqueOrThrow({ where: { slug: "wireless-earbuds-pro" } })).id;

describe("GET /api/products", () => {
  it("returns the 6 seeded products", async () => {
    const res = await request(ctx.app).get("/api/products");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(6);
    expect(res.body[0]).toMatchObject({
      pricePaise: expect.any(Number),
      imageUrl: expect.any(String),
    });
  });
});

describe("carts", () => {
  it("POST /api/carts with 2 x earbuds gives subtotal 299800", async () => {
    const res = await request(ctx.app)
      .post("/api/carts")
      .send({ items: [{ productId: await earbudsId(), quantity: 2 }] });
    expect(res.status).toBe(201);
    expect(res.body.subtotalPaise).toBe(299800);
    expect(res.body.status).toBe("ACTIVE");
    expect(res.body.items[0]).toMatchObject({ name: "Wireless Earbuds Pro", quantity: 2 });
  });

  it("rejects an unknown productId with 422", async () => {
    const res = await request(ctx.app)
      .post("/api/carts")
      .send({ items: [{ productId: "nope", quantity: 1 }] });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("UNPROCESSABLE");
  });

  it("rejects quantity 0 with 400 VALIDATION_ERROR", async () => {
    const res = await request(ctx.app)
      .post("/api/carts")
      .send({ items: [{ productId: await earbudsId(), quantity: 0 }] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("PUT items with [] empties the cart", async () => {
    const created = await request(ctx.app)
      .post("/api/carts")
      .send({ items: [{ productId: await earbudsId(), quantity: 1 }] });
    const res = await request(ctx.app)
      .put(`/api/carts/${created.body.id}/items`)
      .send({ items: [] });
    expect(res.status).toBe(200);
    expect(res.body.subtotalPaise).toBe(0);
    expect(res.body.items).toEqual([]);
  });

  it("PUT replaces items and recomputes the subtotal from current prices", async () => {
    const created = await request(ctx.app)
      .post("/api/carts")
      .send({ items: [{ productId: await earbudsId(), quantity: 1 }] });
    const bottle = await ctx.prisma.product.findUniqueOrThrow({
      where: { slug: "steel-water-bottle" },
    });
    const res = await request(ctx.app)
      .put(`/api/carts/${created.body.id}/items`)
      .send({ items: [{ productId: bottle.id, quantity: 3 }] });
    expect(res.body.subtotalPaise).toBe(3 * 59900);
    expect(res.body.items).toHaveLength(1);
  });

  it("PUT on a COMPLETED cart returns 409", async () => {
    const created = await request(ctx.app)
      .post("/api/carts")
      .send({ items: [{ productId: await earbudsId(), quantity: 1 }] });
    await ctx.prisma.cart.update({ where: { id: created.body.id }, data: { status: "COMPLETED" } });
    const res = await request(ctx.app)
      .put(`/api/carts/${created.body.id}/items`)
      .send({ items: [] });
    expect(res.status).toBe(409);
  });

  it("GET unknown cart returns 404", async () => {
    const res = await request(ctx.app).get("/api/carts/unknown");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});
