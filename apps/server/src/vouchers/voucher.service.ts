import { computeTotals, toSpokenCode, type VoucherCard } from "@voiceretain/shared";
import type { Redis } from "ioredis";
import type { Env } from "../config/env";
import type { Db } from "../db/prisma";
import type { Prisma, Voucher } from "../generated/prisma/client";
import { bumpCacheVersion } from "../services/cache";
import { generateVoucherCode } from "./code-generator";
import { resolveDiscountPercent } from "./discount-policy";

type Tx = Prisma.TransactionClient;

export type IssueVoucherResult =
  | { ok: true; voucher: VoucherCard; spokenCode: string; alreadyIssued: boolean }
  | {
      ok: false;
      reason: "INVALID_PERCENT" | "CART_TOO_SMALL" | "LIMIT_REACHED" | "CART_NOT_ELIGIBLE";
    };

export interface VoucherDeps {
  db: Db;
  redis: Redis;
  env: Pick<Env, "MAX_DISCOUNT_PERCENT" | "MIN_CART_FOR_DISCOUNT_PAISE" | "VOUCHER_TTL_HOURS">;
  /** Test seam for collision handling. */
  generateCode?: () => string;
  /** Debounced dashboard metrics broadcaster. */
  metrics?: { schedule(): void };
}

const MAX_ISSUANCES_PER_CALL = 2;
const MAX_CODE_ATTEMPTS = 5;
const ISSUABLE_CART_STATUSES = new Set(["ACTIVE", "CHECKOUT_STARTED", "ABANDONED"]);

const isUniqueViolation = (err: unknown) =>
  typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";

export const toVoucherCard = (v: Voucher): VoucherCard => ({
  code: v.code,
  percent: v.percent,
  expiresAt: v.expiresAt.toISOString(),
  cartId: v.cartId,
});

export async function issueVoucher(
  deps: VoucherDeps,
  input: { cartId: string; callId: string; requestedPercent: unknown },
): Promise<IssueVoucherResult> {
  for (let attempt = 1; ; attempt++) {
    try {
      const result = await issueOnce(deps, input);
      if (result.ok && !result.alreadyIssued) {
        await bumpCacheVersion(deps.redis);
        deps.metrics?.schedule();
      }
      return result;
    } catch (err) {
      // A generated code collided with an existing one; the transaction rolled back, try again.
      if (isUniqueViolation(err) && attempt < MAX_CODE_ATTEMPTS) continue;
      throw err;
    }
  }
}

async function issueOnce(
  deps: VoucherDeps,
  input: { cartId: string; callId: string; requestedPercent: unknown },
): Promise<IssueVoucherResult> {
  const { db, env } = deps;
  const generate = deps.generateCode ?? generateVoucherCode;

  return db.$transaction(async (tx) => {
    // Serialize concurrent requests for the same cart.
    await tx.$queryRaw`SELECT id FROM "Cart" WHERE id = ${input.cartId} FOR UPDATE`;
    const cart = await tx.cart.findUnique({ where: { id: input.cartId } });
    if (!cart || !ISSUABLE_CART_STATUSES.has(cart.status)) {
      return { ok: false, reason: "CART_NOT_ELIGIBLE" } as const;
    }

    const decision = resolveDiscountPercent(input.requestedPercent, {
      subtotalPaise: cart.subtotalPaise,
      capPercent: env.MAX_DISCOUNT_PERCENT,
      minCartPaise: env.MIN_CART_FOR_DISCOUNT_PAISE,
    });
    if (!decision.ok) return decision;

    const now = new Date();
    let existing = await tx.voucher.findFirst({
      where: { cartId: cart.id, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
    });
    if (existing && existing.expiresAt <= now) {
      await tx.voucher.update({ where: { id: existing.id }, data: { status: "EXPIRED" } });
      existing = null;
    }

    if (existing && decision.percent <= existing.percent) {
      return {
        ok: true,
        voucher: toVoucherCard(existing),
        spokenCode: toSpokenCode(existing.code),
        alreadyIssued: true,
      } as const;
    }

    const issuedThisCall = await tx.voucher.count({ where: { callId: input.callId } });
    if (issuedThisCall >= MAX_ISSUANCES_PER_CALL) {
      return { ok: false, reason: "LIMIT_REACHED" } as const;
    }

    if (existing) {
      await tx.voucher.update({ where: { id: existing.id }, data: { status: "SUPERSEDED" } });
    }
    const voucher = await tx.voucher.create({
      data: {
        code: generate(),
        percent: decision.percent,
        cartId: cart.id,
        callId: input.callId,
        expiresAt: new Date(now.getTime() + env.VOUCHER_TTL_HOURS * 3600_000),
      },
    });
    return {
      ok: true,
      voucher: toVoucherCard(voucher),
      spokenCode: toSpokenCode(voucher.code),
      alreadyIssued: false,
    } as const;
  });
}

export type ValidateVoucherResult =
  | { valid: true; voucher: Voucher }
  | { valid: false; reason: "NOT_FOUND" | "WRONG_CART" | "EXPIRED" | "NOT_ACTIVE" };

export async function validateVoucher(
  db: Db | Tx,
  code: string,
  cartId: string,
  now: Date = new Date(),
): Promise<ValidateVoucherResult> {
  const voucher = await db.voucher.findUnique({ where: { code: code.trim().toUpperCase() } });
  if (!voucher) return { valid: false, reason: "NOT_FOUND" };
  if (voucher.cartId !== cartId) return { valid: false, reason: "WRONG_CART" };
  if (voucher.status === "EXPIRED") return { valid: false, reason: "EXPIRED" };
  if (voucher.status === "ACTIVE" && voucher.expiresAt <= now) {
    await db.voucher.update({ where: { id: voucher.id }, data: { status: "EXPIRED" } });
    return { valid: false, reason: "EXPIRED" };
  }
  if (voucher.status !== "ACTIVE") return { valid: false, reason: "NOT_ACTIVE" };
  return { valid: true, voucher };
}

/** Marks an ACTIVE voucher REDEEMED and links it to the order. Throws if it is no longer active. */
export async function redeemVoucher(tx: Tx, voucherId: string, orderId: string): Promise<void> {
  const claimed = await tx.voucher.updateMany({
    where: { id: voucherId, status: "ACTIVE" },
    data: { status: "REDEEMED", redeemedAt: new Date() },
  });
  if (claimed.count === 0) throw new Error("Voucher is no longer active");
  await tx.order.update({ where: { id: orderId }, data: { voucherId } });
}

/** What a valid voucher is worth on a cart, for the checkout "Apply" button. */
export async function quoteVoucher(
  db: Db,
  code: string,
  cartId: string,
): Promise<
  | { valid: true; percent: number; discountPaise: number }
  | { valid: false; reason: "NOT_FOUND" | "WRONG_CART" | "EXPIRED" | "NOT_ACTIVE" }
> {
  const result = await validateVoucher(db, code, cartId);
  if (!result.valid) return result;
  const cart = await db.cart.findUnique({ where: { id: cartId } });
  if (!cart) return { valid: false, reason: "WRONG_CART" };
  const { discountPaise } = computeTotals(cart.subtotalPaise, result.voucher.percent);
  return { valid: true, percent: result.voucher.percent, discountPaise };
}
