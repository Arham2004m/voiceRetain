import type { CallSummaryDTO, TranscriptTurnDTO } from "@voiceretain/shared";
import type { Prisma, TranscriptTurn } from "../generated/prisma/client";

export const callInclude = { customer: true, cart: true } satisfies Prisma.CallLogInclude;

export type CallWithRelations = Prisma.CallLogGetPayload<{ include: typeof callInclude }>;

export function toCallSummaryDTO(call: CallWithRelations): CallSummaryDTO {
  return {
    id: call.id,
    cartId: call.cartId,
    customerName: call.customer.name,
    customerPhone: call.customer.phone,
    cartTotalPaise: call.cart.subtotalPaise,
    status: call.status,
    outcome: call.outcome,
    sentiment: call.sentiment,
    objection: call.objection,
    summary: call.summary,
    durationSec: call.durationSec,
    startedAt: call.startedAt.toISOString(),
  };
}

export function toTurnDTO(turn: TranscriptTurn): TranscriptTurnDTO {
  return {
    id: turn.id,
    callId: turn.callId,
    speaker: turn.speaker,
    text: turn.text,
    latencyMs: turn.latencyMs,
    createdAt: turn.createdAt.toISOString(),
  };
}
