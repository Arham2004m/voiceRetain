import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { VOUCHER_REGEX, toSpokenCode } from "@voiceretain/shared";
import { getCacheVersion } from "../services/cache";
import { issueVoucher, validateVoucher } from "../vouchers/voucher.service";
import { makeCart } from "./setup/fixtures";
import { createTestContext } from "./setup/test-app";

const ctx = createTestContext();
const deps = () => ({ db: ctx.prisma, redis: ctx.redis, env: ctx.env });

beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

async function cartWithCall(opts: Parameters<typeof makeCart>[1] = {}) {
  const { cartId, customerId } = await makeCart(ctx.prisma, { status: "ABANDONED", ...opts });
  const call = await ctx.prisma.callLog.create({
    data: { cartId, customerId: customerId!, status: "IN_PROGRESS", answeredAt: new Date() },
  });
  return { cartId, callId: call.id };
}

const issue = (cartId: string, callId: string, requestedPercent: unknown, d = deps()) =>
  issueVoucher(d, { cartId, callId, requestedPercent });

describe("issueVoucher", () => {
  it("issues a 10 percent voucher for a 1499 cart", async () => {
    const { cartId, callId } = await cartWithCall();
    const result = await issue(cartId, callId, 10);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.voucher.percent).toBe(10);
    expect(result.voucher.code).toMatch(VOUCHER_REGEX);
    expect(result.voucher.cartId).toBe(cartId);
    expect(result.spokenCode).toBe(toSpokenCode(result.voucher.code));
    expect(result.alreadyIssued).toBe(false);
    const expiresIn = new Date(result.voucher.expiresAt).getTime() - Date.now();
    expect(expiresIn).toBeGreaterThan(23.9 * 3600_000);
    expect(expiresIn).toBeLessThanOrEqual(24 * 3600_000);
    const row = await ctx.prisma.voucher.findUniqueOrThrow({
      where: { code: result.voucher.code },
    });
    expect(row).toMatchObject({ status: "ACTIVE", callId, cartId, percent: 10 });
  });

  it("clamps a request for 40 percent to 15", async () => {
    const { cartId, callId } = await cartWithCall();
    const result = await issue(cartId, callId, 40);
    expect(result).toMatchObject({ ok: true, voucher: { percent: 15 } });
  });

  it("honours a lowered MAX_DISCOUNT_PERCENT", async () => {
    const { cartId, callId } = await cartWithCall();
    const lowered = { ...deps(), env: { ...ctx.env, MAX_DISCOUNT_PERCENT: 10 } };
    expect(await issue(cartId, callId, 15, lowered)).toMatchObject({
      ok: true,
      voucher: { percent: 10 },
    });
  });

  it("returns the existing voucher for the same tier", async () => {
    const { cartId, callId } = await cartWithCall();
    const first = await issue(cartId, callId, 10);
    const second = await issue(cartId, callId, 10);
    expect(second).toMatchObject({ ok: true, alreadyIssued: true });
    expect(first.ok && second.ok && second.voucher.code === first.voucher.code).toBe(true);
    expect(await ctx.prisma.voucher.count()).toBe(1);
  });

  it("returns the existing voucher for a lower tier", async () => {
    const { cartId, callId } = await cartWithCall();
    await issue(cartId, callId, 10);
    const lower = await issue(cartId, callId, 5);
    expect(lower).toMatchObject({ ok: true, alreadyIssued: true, voucher: { percent: 10 } });
    expect(await ctx.prisma.voucher.count()).toBe(1);
  });

  it("supersedes the old voucher when a higher tier is requested", async () => {
    const { cartId, callId } = await cartWithCall();
    const first = await issue(cartId, callId, 10);
    const second = await issue(cartId, callId, 15);
    expect(second).toMatchObject({ ok: true, alreadyIssued: false, voucher: { percent: 15 } });
    const rows = await ctx.prisma.voucher.findMany({ orderBy: { createdAt: "asc" } });
    expect(rows.map((r) => [r.percent, r.status])).toEqual([
      [10, "SUPERSEDED"],
      [15, "ACTIVE"],
    ]);
    expect(first.ok && rows[0]?.code === first.voucher.code).toBe(true);
  });

  it("refuses a third issuance in one call with LIMIT_REACHED", async () => {
    const { cartId, callId } = await cartWithCall();
    await issue(cartId, callId, 5);
    await issue(cartId, callId, 10);
    expect(await issue(cartId, callId, 15)).toEqual({ ok: false, reason: "LIMIT_REACHED" });
    expect(await ctx.prisma.voucher.count()).toBe(2);
    // Asking for the tier already held is still answered with the existing code.
    expect(await issue(cartId, callId, 10)).toMatchObject({ ok: true, alreadyIssued: true });
  });

  it("refuses a completed cart with CART_NOT_ELIGIBLE", async () => {
    const { cartId, callId } = await cartWithCall();
    await ctx.prisma.cart.update({ where: { id: cartId }, data: { status: "COMPLETED" } });
    expect(await issue(cartId, callId, 10)).toEqual({ ok: false, reason: "CART_NOT_ELIGIBLE" });
  });

  it("refuses an unknown cart with CART_NOT_ELIGIBLE", async () => {
    const { callId } = await cartWithCall();
    expect(await issue("missing", callId, 10)).toEqual({ ok: false, reason: "CART_NOT_ELIGIBLE" });
  });

  it("refuses carts below the minimum and invalid percentages", async () => {
    const { cartId, callId } = await cartWithCall();
    expect(await issue(cartId, callId, "abc")).toEqual({ ok: false, reason: "INVALID_PERCENT" });
    await ctx.prisma.cart.update({ where: { id: cartId }, data: { subtotalPaise: 40_000 } });
    expect(await issue(cartId, callId, 10)).toEqual({ ok: false, reason: "CART_TOO_SMALL" });
  });

  it("retries on a code collision", async () => {
    const first = await cartWithCall();
    const existing = await issue(first.cartId, first.callId, 10);
    if (!existing.ok) throw new Error("setup failed");
    const second = await cartWithCall({ phone: "9123456789" });
    const codes = [existing.voucher.code, existing.voucher.code, "VR-ZZZZ-2222"];
    const result = await issueVoucher(
      { ...deps(), generateCode: () => codes.shift()! },
      { cartId: second.cartId, callId: second.callId, requestedPercent: 5 },
    );
    expect(result).toMatchObject({ ok: true, voucher: { code: "VR-ZZZZ-2222" } });
  });

  it("creates only one voucher for concurrent same-tier requests", async () => {
    const { cartId, callId } = await cartWithCall();
    const [a, b] = await Promise.all([issue(cartId, callId, 10), issue(cartId, callId, 10)]);
    expect(a.ok && b.ok).toBe(true);
    expect(await ctx.prisma.voucher.count({ where: { status: "ACTIVE" } })).toBe(1);
    const flags = [a, b].map((r) => r.ok && r.alreadyIssued).sort();
    expect(flags).toEqual([false, true]);
  });

  it("bumps the cache version", async () => {
    const { cartId, callId } = await cartWithCall();
    const before = await getCacheVersion(ctx.redis);
    await issue(cartId, callId, 10);
    expect(await getCacheVersion(ctx.redis)).toBeGreaterThan(before);
  });
});

describe("validateVoucher", () => {
  async function issued(percent = 10) {
    const { cartId, callId } = await cartWithCall();
    const result = await issue(cartId, callId, percent);
    if (!result.ok) throw new Error("setup failed");
    return { cartId, callId, code: result.voucher.code };
  }

  it("accepts a lowercase, padded code", async () => {
    const { cartId, code } = await issued();
    const result = await validateVoucher(ctx.prisma, `  ${code.toLowerCase()} `, cartId);
    expect(result).toMatchObject({ valid: true, voucher: { code, percent: 10 } });
  });

  it("returns EXPIRED after 24h and marks the voucher EXPIRED", async () => {
    const { cartId, code } = await issued();
    const later = new Date(Date.now() + 25 * 3600_000);
    expect(await validateVoucher(ctx.prisma, code, cartId, later)).toEqual({
      valid: false,
      reason: "EXPIRED",
    });
    const row = await ctx.prisma.voucher.findUniqueOrThrow({ where: { code } });
    expect(row.status).toBe("EXPIRED");
    expect(await validateVoucher(ctx.prisma, code, cartId)).toEqual({
      valid: false,
      reason: "EXPIRED",
    });
  });

  it("returns WRONG_CART for another cart's voucher", async () => {
    const { code } = await issued();
    const other = await makeCart(ctx.prisma, { phone: "9123456789" });
    expect(await validateVoucher(ctx.prisma, code, other.cartId)).toEqual({
      valid: false,
      reason: "WRONG_CART",
    });
  });

  it("returns NOT_ACTIVE for a superseded voucher", async () => {
    const { cartId, callId, code } = await issued(10);
    await issue(cartId, callId, 15);
    expect(await validateVoucher(ctx.prisma, code, cartId)).toEqual({
      valid: false,
      reason: "NOT_ACTIVE",
    });
  });

  it("returns NOT_FOUND for an unknown code", async () => {
    const { cartId } = await cartWithCall();
    expect(await validateVoucher(ctx.prisma, "VR-NOPE-NOPE", cartId)).toEqual({
      valid: false,
      reason: "NOT_FOUND",
    });
  });
});
