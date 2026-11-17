import type { CallDetailDTO, CallSummaryDTO } from "@voiceretain/shared";
import type { Db } from "../db/prisma";
import type { CallOutcome, Sentiment } from "../generated/prisma/client";
import { notFound } from "../http/errors";
import { callInclude, toCallSummaryDTO, toTurnDTO } from "../mappers/call.mapper";
import { toOrderDTO } from "../mappers/order.mapper";
import { toVoucherDTO } from "../mappers/voucher.mapper";

export interface ListCallsQuery {
  cursor?: string;
  limit: number;
  outcome?: CallOutcome;
  sentiment?: Sentiment;
  customerId?: string;
}

export async function listCalls(
  db: Db,
  { cursor, limit, outcome, sentiment, customerId }: ListCallsQuery,
): Promise<{ items: CallSummaryDTO[]; nextCursor: string | null }> {
  const rows = await db.callLog.findMany({
    where: {
      ...(outcome ? { outcome } : {}),
      ...(sentiment ? { sentiment } : {}),
      ...(customerId ? { customerId } : {}),
    },
    include: callInclude,
    // The id breaks ties between calls that started in the same instant, so paging is stable.
    orderBy: [{ startedAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const page = rows.slice(0, limit);
  return {
    items: page.map(toCallSummaryDTO),
    nextCursor: rows.length > limit ? (page[page.length - 1]?.id ?? null) : null,
  };
}

export async function getCallDetail(db: Db, id: string): Promise<CallDetailDTO> {
  const call = await db.callLog.findUnique({
    where: { id },
    include: {
      customer: true,
      cart: { include: { order: { include: { voucher: true } } } },
      turns: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
      vouchers: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
    },
  });
  if (!call) throw notFound("Call not found");

  return {
    ...toCallSummaryDTO(call),
    endReason: call.endReason,
    answeredAt: call.answeredAt?.toISOString() ?? null,
    endedAt: call.endedAt?.toISOString() ?? null,
    avgLatencyMs: call.avgLatencyMs,
    turns: call.turns.map(toTurnDTO),
    vouchers: call.vouchers.map(toVoucherDTO),
    order: call.cart.order ? toOrderDTO(call.cart.order) : null,
  };
}
