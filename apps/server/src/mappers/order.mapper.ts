import type { OrderDTO } from "@voiceretain/shared";
import type { Order, Voucher } from "../generated/prisma/client";

export function toOrderDTO(order: Order & { voucher: Voucher | null }): OrderDTO {
  return {
    id: order.id,
    cartId: order.cartId,
    ...(order.voucher ? { voucherCode: order.voucher.code } : {}),
    subtotalPaise: order.subtotalPaise,
    discountPaise: order.discountPaise,
    // Shipping is not stored: it is whatever makes the total add up.
    shippingPaise: order.totalPaise - order.subtotalPaise + order.discountPaise,
    totalPaise: order.totalPaise,
    createdAt: order.createdAt.toISOString(),
  };
}
