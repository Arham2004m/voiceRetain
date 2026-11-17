import type { VoucherDTO } from "@voiceretain/shared";
import type { Voucher } from "../generated/prisma/client";

export function toVoucherDTO(v: Voucher): VoucherDTO {
  return {
    id: v.id,
    code: v.code,
    percent: v.percent,
    status: v.status,
    cartId: v.cartId,
    callId: v.callId,
    expiresAt: v.expiresAt.toISOString(),
    redeemedAt: v.redeemedAt?.toISOString() ?? null,
    createdAt: v.createdAt.toISOString(),
  };
}
