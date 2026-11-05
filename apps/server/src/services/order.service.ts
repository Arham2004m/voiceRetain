import { computeTotals, type OrderDTO } from "@voiceretain/shared";
import type { Redis } from "ioredis";
import type { Db } from "../db/prisma";
import { HttpError, conflict, notFound, unprocessable } from "../http/errors";
import { callInclude, toCallSummaryDTO } from "../mappers/call.mapper";
import { toOrderDTO } from "../mappers/order.mapper";
import { cancelAbandonmentCheck, type AbandonmentQueue } from "../queue/abandonment.queue";
import type { Emitter } from "../realtime/emitter";
import { redeemVoucher, validateVoucher } from "../vouchers/voucher.service";
import { bumpCacheVersion } from "./cache";

export interface OrderDeps {
  prisma: Db;
  redis: Redis;
  queue: AbandonmentQueue;
  emitter: Emitter;
  metrics: { schedule(): void };
}

const COMPLETABLE = new Set(["ACTIVE", "CHECKOUT_STARTED", "ABANDONED"]);

/**
 * Places the order in one transaction. A cart counts as RECOVERED only when the agent actually
 * spoke to the customer (an answered call); a missed or declined call followed by an ordinary
 * order is just COMPLETED, so recovery metrics are not inflated.
 */
export async function completeOrder(
  deps: OrderDeps,
  cartId: string,
  voucherCode?: string,
): Promise<OrderDTO> {
  const { prisma, redis, queue, emitter, metrics } = deps;

  const { order, creditedCallId } = await prisma.$transaction(async (tx) => {
    // Serialize concurrent completions of the same cart.
    await tx.$queryRaw`SELECT id FROM "Cart" WHERE id = ${cartId} FOR UPDATE`;
    const cart = await tx.cart.findUnique({
      where: { id: cartId },
      include: { items: true, calls: { orderBy: { startedAt: "desc" } } },
    });
    if (!cart) throw notFound("Cart not found");
    if (!COMPLETABLE.has(cart.status)) throw conflict("Cart is already completed");
    if (cart.items.length === 0) {
      throw new HttpError(422, "EMPTY_CART", "Add at least one item before placing an order");
    }

    let percent = 0;
    let voucherId: string | undefined;
    if (voucherCode) {
      const checked = await validateVoucher(tx, voucherCode, cartId);
      if (!checked.valid) {
        throw unprocessable(`Voucher cannot be used: ${checked.reason}`, {
          reason: checked.reason,
        });
      }
      percent = checked.voucher.percent;
      voucherId = checked.voucher.id;
    }

    const totals = computeTotals(cart.subtotalPaise, percent);
    const created = await tx.order.create({
      data: {
        cartId,
        subtotalPaise: totals.subtotalPaise,
        discountPaise: totals.discountPaise,
        totalPaise: totals.totalPaise,
      },
    });
    if (voucherId) await redeemVoucher(tx, voucherId, created.id);

    const answered = cart.calls.find((c) => c.answeredAt !== null);
    await tx.cart.update({
      where: { id: cartId },
      data: { status: answered ? "RECOVERED" : "COMPLETED", completedAt: new Date() },
    });
    if (answered) {
      await tx.callLog.update({ where: { id: answered.id }, data: { outcome: "RECOVERED" } });
    }
    if (cart.customerId) {
      await tx.customer.update({
        where: { id: cart.customerId },
        data: { lifetimeValuePaise: { increment: totals.totalPaise } },
      });
    }

    const withVoucher = await tx.order.findUniqueOrThrow({
      where: { id: created.id },
      include: { voucher: true },
    });
    return { order: withVoucher, creditedCallId: answered?.id };
  });

  await cancelAbandonmentCheck(queue, cartId);
  await bumpCacheVersion(redis);
  if (creditedCallId) {
    const call = await prisma.callLog.findUnique({
      where: { id: creditedCallId },
      include: callInclude,
    });
    if (call) emitter.toDashboard("dashboard:call-updated", toCallSummaryDTO(call));
  }
  metrics.schedule();
  return toOrderDTO(order);
}

export async function getOrder(db: Db, id: string): Promise<OrderDTO> {
  const order = await db.order.findUnique({ where: { id }, include: { voucher: true } });
  if (!order) throw notFound("Order not found");
  return toOrderDTO(order);
}
