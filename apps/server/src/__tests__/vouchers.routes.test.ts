import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { issueVoucher } from "../vouchers/voucher.service";
import { makeCart } from "./setup/fixtures";
import { createTestContext } from "./setup/test-app";

const ctx = createTestContext();

beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

async function voucherFor(phone: string, percent = 10) {
  const { cartId, customerId } = await makeCart(ctx.prisma, { status: "ABANDONED", phone });
  const call = await ctx.prisma.callLog.create({
    data: { cartId, customerId: customerId!, status: "ENDED" },
  });
  const result = await issueVoucher(
    { db: ctx.prisma, redis: ctx.redis, env: ctx.env },
    { cartId, callId: call.id, requestedPercent: percent },
  );
  if (!result.ok) throw new Error("setup failed");
  return { cartId, code: result.voucher.code };
}

describe("POST /api/vouchers/validate", () => {
  it("returns the percent and discount for a valid code", async () => {
    const { cartId, code } = await voucherFor("9876543210");
    const res = await request(ctx.app).post("/api/vouchers/validate").send({ code, cartId });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ valid: true, percent: 10, discountPaise: 14990 });
  });

  it("returns valid:false with a reason", async () => {
    const { cartId } = await voucherFor("9876543210");
    const res = await request(ctx.app)
      .post("/api/vouchers/validate")
      .send({ code: "VR-NOPE-NOPE", cartId });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ valid: false, reason: "NOT_FOUND" });
  });

  it("returns WRONG_CART for another cart", async () => {
    const { code } = await voucherFor("9876543210");
    const other = await makeCart(ctx.prisma, { phone: "9123456789" });
    const res = await request(ctx.app)
      .post("/api/vouchers/validate")
      .send({ code, cartId: other.cartId });
    expect(res.body).toEqual({ valid: false, reason: "WRONG_CART" });
  });

  it("rejects a missing code with 400", async () => {
    const res = await request(ctx.app).post("/api/vouchers/validate").send({ cartId: "x" });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/vouchers", () => {
  it("paginates with a cursor and no duplicates", async () => {
    for (let i = 0; i < 5; i++) await voucherFor(`91234567${10 + i}`);
    const seen: string[] = [];
    let cursor: string | null | undefined;
    let pages = 0;
    do {
      const res = await request(ctx.app)
        .get("/api/vouchers")
        .query({ limit: 2, ...(cursor ? { cursor } : {}) });
      expect(res.status).toBe(200);
      seen.push(...res.body.items.map((v: { code: string }) => v.code));
      cursor = res.body.nextCursor;
      pages++;
    } while (cursor);
    expect(pages).toBe(3);
    expect(new Set(seen).size).toBe(5);
  });

  it("filters by status and returns DTO fields", async () => {
    const a = await voucherFor("9876543210");
    await voucherFor("9123456789");
    await ctx.prisma.voucher.update({ where: { code: a.code }, data: { status: "EXPIRED" } });
    const res = await request(ctx.app).get("/api/vouchers").query({ status: "EXPIRED" });
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({
      code: a.code,
      status: "EXPIRED",
      percent: 10,
      cartId: a.cartId,
      redeemedAt: null,
    });
    expect(res.body.nextCursor).toBeNull();
  });

  it("rejects an unknown status with 400", async () => {
    const res = await request(ctx.app).get("/api/vouchers").query({ status: "WHATEVER" });
    expect(res.status).toBe(400);
  });
});
