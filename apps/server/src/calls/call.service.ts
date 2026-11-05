import { MAX_UTTERANCE_CHARS } from "@voiceretain/shared";
import type { AgentReplyPayload, IncomingCallPayload } from "@voiceretain/shared";
import type { Redis } from "ioredis";
import type { Agent, Analyzer, CallAnalysis } from "../agent/agent.types";
import type { Env } from "../config/env";
import type { Db } from "../db/prisma";
import type { CallLog, Prisma } from "../generated/prisma/client";
import { logger } from "../lib/logger";
import { callInclude, toCallSummaryDTO, toTurnDTO } from "../mappers/call.mapper";
import type { Emitter } from "../realtime/emitter";
import { bumpCacheVersion } from "../services/cache";
import type { CallTimerStore } from "./call.timers";
import { buildGreeting } from "./greeting";
import { decideOutcome } from "./outcome";

export type CallErrorCode = "NOT_FOUND" | "FORBIDDEN" | "BAD_STATE";

export class CallError extends Error {
  constructor(
    public code: CallErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface CallServiceDeps {
  db: Db;
  redis: Redis;
  emitter: Emitter;
  timers: CallTimerStore;
  env: Pick<Env, "RING_TIMEOUT_MS" | "MAX_CALL_DURATION_MS" | "DISCONNECT_GRACE_MS">;
  agent: Agent;
  analyzer: Analyzer;
  /** Debounced dashboard metrics broadcaster (no-op until Task 9.1). */
  metrics: { schedule(): void };
}

export interface CallService {
  startCall(cartId: string): Promise<CallLog>;
  /** Worker entry point: creates the call inside the caller's transaction; returns the post-commit hook. */
  startCallInTx(cartId: string, tx: Prisma.TransactionClient): Promise<() => Promise<void>>;
  answerCall(callId: string, phone: string): Promise<AgentReplyPayload>;
  declineCall(callId: string, phone: string): Promise<void>;
  markMissed(callId: string): Promise<void>;
  getActiveCallForPhone(phone: string): Promise<IncomingCallPayload | null>;
  recoverStaleCalls(): Promise<number>;
  /** Throws CallError unless the call belongs to the phone and is in the given status. */
  assertCallAccess(callId: string, phone: string, status: "RINGING" | "IN_PROGRESS"): Promise<void>;
  handleUtterance(callId: string, phone: string, text: string): Promise<void>;
  endCall(callId: string, reason: EndReason): Promise<void>;
  handleDisconnect(phone: string): Promise<void>;
  handleReconnect(phone: string): Promise<void>;
}

export type EndReason =
  | "CUSTOMER_HANGUP"
  | "AGENT_ENDED"
  | "MAX_DURATION"
  | "DISCONNECTED"
  | "LLM_FAILURE"
  | "SERVER_RESTART";

export function createCallService(deps: CallServiceDeps): CallService {
  const { db, redis, emitter, timers, env, metrics } = deps;

  async function publishCall(callId: string): Promise<void> {
    const call = await db.callLog.findUnique({ where: { id: callId }, include: callInclude });
    if (call) emitter.toDashboard("dashboard:call-updated", toCallSummaryDTO(call));
  }

  async function afterWrite(callId: string): Promise<void> {
    await bumpCacheVersion(redis);
    await publishCall(callId);
    metrics.schedule();
  }

  async function loadOwned(callId: string, phone: string) {
    const call = await db.callLog.findUnique({
      where: { id: callId },
      include: {
        customer: true,
        cart: { include: { items: { include: { product: true }, orderBy: { id: "asc" } } } },
      },
    });
    if (!call) throw new CallError("NOT_FOUND", "Call not found");
    if (call.customer.phone !== phone) throw new CallError("FORBIDDEN", "Not your call");
    return call;
  }

  async function startCallInTx(cartId: string, tx: Prisma.TransactionClient) {
    const cart = await tx.cart.findUnique({
      where: { id: cartId },
      include: { customer: true, items: true },
    });
    if (!cart?.customer) throw new CallError("NOT_FOUND", "Cart or customer not found");
    const call = await tx.callLog.create({ data: { cartId, customerId: cart.customer.id } });
    const incoming: IncomingCallPayload = {
      callId: call.id,
      customerName: cart.customer.name,
      cartId,
      subtotalPaise: cart.subtotalPaise,
      itemCount: cart.items.reduce((sum, i) => sum + i.quantity, 0),
    };
    const phone = cart.customer.phone;
    return async () => {
      timers.set("ring", call.id, env.RING_TIMEOUT_MS, () => service.markMissed(call.id));
      emitter.toPhone(phone, "call:incoming", incoming);
      await afterWrite(call.id);
    };
  }

  const chains = new Map<string, Promise<unknown>>();
  const failures = new Map<string, number>();

  /** Serializes work per call so overlapping utterances are handled in order. */
  function enqueue<T>(callId: string, task: () => Promise<T>): Promise<T> {
    const previous = chains.get(callId) ?? Promise.resolve();
    const next = previous.then(task);
    const tail = next.catch(() => undefined);
    chains.set(callId, tail);
    void tail.then(() => {
      if (chains.get(callId) === tail) chains.delete(callId);
    });
    return next;
  }

  async function isInProgress(callId: string): Promise<boolean> {
    const row = await db.callLog.findUnique({ where: { id: callId }, select: { status: true } });
    return row?.status === "IN_PROGRESS";
  }

  const findInProgressByPhone = (phone: string) =>
    db.callLog.findFirst({
      where: { status: "IN_PROGRESS", customer: { phone } },
      select: { id: true },
    });

  const service: CallService = {
    startCallInTx,

    async startCall(cartId) {
      let created!: CallLog;
      const afterCommit = await db.$transaction(async (tx) => {
        const hook = await startCallInTx(cartId, tx);
        created = (await tx.callLog.findFirstOrThrow({
          where: { cartId },
          orderBy: { startedAt: "desc" },
        })) as CallLog;
        return hook;
      });
      await afterCommit();
      return created;
    },

    async answerCall(callId, phone) {
      const call = await loadOwned(callId, phone);
      const claimed = await db.callLog.updateMany({
        where: { id: callId, status: "RINGING" },
        data: { status: "IN_PROGRESS", answeredAt: new Date() },
      });
      if (claimed.count === 0) throw new CallError("BAD_STATE", "Call is no longer ringing");

      timers.clear("ring", callId);
      timers.set("maxDuration", callId, env.MAX_CALL_DURATION_MS, () =>
        service.endCall(callId, "MAX_DURATION"),
      );

      const text = buildGreeting({
        customerName: call.customer.name,
        items: call.cart.items.map((i) => ({ name: i.product.name })),
      });
      const turn = await db.transcriptTurn.create({
        data: { callId, speaker: "AGENT", text },
      });
      emitter.toDashboard("dashboard:turn", { callId, turn: toTurnDTO(turn) });
      await afterWrite(callId);
      return { callId, text, endsCall: false };
    },

    async declineCall(callId, phone) {
      const call = await loadOwned(callId, phone);
      const claimed = await db.callLog.updateMany({
        where: { id: callId, status: "RINGING" },
        data: { status: "ENDED", outcome: "DECLINED", endReason: "DECLINED", endedAt: new Date() },
      });
      if (claimed.count === 0) throw new CallError("BAD_STATE", "Call is no longer ringing");
      timers.clearAll(callId);
      emitter.toPhone(call.customer.phone, "call:ended", { callId, outcome: "DECLINED" });
      await afterWrite(callId);
    },

    async markMissed(callId) {
      const claimed = await db.callLog.updateMany({
        where: { id: callId, status: "RINGING" },
        data: { status: "MISSED", outcome: "NO_ANSWER", endedAt: new Date() },
      });
      if (claimed.count === 0) return;
      timers.clearAll(callId);
      const call = await db.callLog.findUniqueOrThrow({
        where: { id: callId },
        include: { customer: true },
      });
      emitter.toPhone(call.customer.phone, "call:ring-cancelled", { callId });
      await afterWrite(callId);
    },

    async getActiveCallForPhone(phone) {
      const call = await db.callLog.findFirst({
        where: { status: "RINGING", customer: { phone } },
        orderBy: { startedAt: "desc" },
        include: { customer: true, cart: { include: { items: true } } },
      });
      if (!call) return null;
      return {
        callId: call.id,
        customerName: call.customer.name,
        cartId: call.cartId,
        subtotalPaise: call.cart.subtotalPaise,
        itemCount: call.cart.items.reduce((sum, i) => sum + i.quantity, 0),
      };
    },

    async assertCallAccess(callId, phone, status) {
      const call = await loadOwned(callId, phone);
      if (call.status !== status)
        throw new CallError("BAD_STATE", `Call is not ${status.toLowerCase()}`);
    },

    async handleUtterance(callId, phone, rawText) {
      await service.assertCallAccess(callId, phone, "IN_PROGRESS");
      const text = rawText.trim().slice(0, MAX_UTTERANCE_CHARS);
      if (!text) return;
      return enqueue(callId, async () => {
        if (!(await isInProgress(callId))) return;
        const customerTurn = await db.transcriptTurn.create({
          data: { callId, speaker: "CUSTOMER", text },
        });
        emitter.toDashboard("dashboard:turn", { callId, turn: toTurnDTO(customerTurn) });

        const failuresSoFar = failures.get(callId) ?? 0;
        const startedAt = Date.now();
        const result = await deps.agent.runTurn({
          callId,
          customerText: text,
          consecutiveFailures: failuresSoFar,
        });
        const latencyMs = Date.now() - startedAt;
        failures.set(callId, result.failed ? failuresSoFar + 1 : 0);

        // The customer may have hung up while the agent was thinking.
        if (!(await isInProgress(callId))) return;
        const agentTurn = await db.transcriptTurn.create({
          data: { callId, speaker: "AGENT", text: result.replyText, latencyMs },
        });
        emitter.toDashboard("dashboard:turn", { callId, turn: toTurnDTO(agentTurn) });
        emitter.toPhone(phone, "call:agent-reply", {
          callId,
          text: result.replyText,
          ...(result.voucher ? { voucher: result.voucher } : {}),
          endsCall: result.endsCall,
        });
        if (result.endsCall) {
          await service.endCall(
            callId,
            result.endReason === "LLM_FAILURE" ? "LLM_FAILURE" : "AGENT_ENDED",
          );
        }
      });
    },

    async endCall(callId, reason) {
      const endedAt = new Date();
      const claimed = await db.callLog.updateMany({
        where: { id: callId, status: "IN_PROGRESS" },
        data: { status: "ENDED", endedAt, endReason: reason },
      });
      if (claimed.count === 0) return; // already ended: idempotent
      timers.clearAll(callId);
      failures.delete(callId);

      const call = await db.callLog.findUniqueOrThrow({
        where: { id: callId },
        include: {
          customer: true,
          cart: { include: { order: true } },
          turns: { orderBy: { createdAt: "asc" } },
        },
      });
      const durationSec = call.answeredAt
        ? Math.max(0, Math.round((endedAt.getTime() - call.answeredAt.getTime()) / 1000))
        : 0;
      const latencies = call.turns
        .filter((t) => t.speaker === "AGENT" && t.latencyMs !== null)
        .map((t) => t.latencyMs as number);
      const avgLatencyMs = latencies.length
        ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
        : null;

      let analysis: CallAnalysis;
      try {
        analysis = await deps.analyzer.analyze(call.turns.map(toTurnDTO));
      } catch (err) {
        logger.error({ err, callId }, "post-call analysis failed");
        analysis = {
          sentiment: "NEUTRAL",
          objection: "OTHER",
          intent: "UNDECIDED",
          summary: "Analysis unavailable.",
        };
      }

      const voucherIssued = (await db.voucher.count({ where: { callId } })) > 0;
      const outcome = decideOutcome({
        status: "ENDED",
        answered: call.answeredAt !== null,
        declinedWhileRinging: false,
        voucherIssued,
        intent: analysis.intent,
        orderPlaced: call.cart.order !== null,
      });
      await db.callLog.update({
        where: { id: callId },
        data: {
          durationSec,
          avgLatencyMs,
          sentiment: analysis.sentiment,
          objection: analysis.objection,
          summary: analysis.summary,
          outcome,
        },
      });
      emitter.toPhone(call.customer.phone, "call:ended", { callId, outcome });
      await afterWrite(callId);
    },

    async handleDisconnect(phone) {
      const call = await findInProgressByPhone(phone);
      if (!call) return;
      timers.set("disconnect", call.id, env.DISCONNECT_GRACE_MS, () =>
        service.endCall(call.id, "DISCONNECTED"),
      );
    },

    async handleReconnect(phone) {
      const call = await findInProgressByPhone(phone);
      if (call) timers.clear("disconnect", call.id);
    },

    async recoverStaleCalls() {
      const now = Date.now();
      let cleaned = 0;
      const active = await db.callLog.findMany({
        where: { status: { in: ["RINGING", "IN_PROGRESS"] } },
      });
      for (const call of active) {
        if (call.status === "RINGING") {
          const remaining = call.startedAt.getTime() + env.RING_TIMEOUT_MS - now;
          if (remaining <= 0) {
            await service.markMissed(call.id);
            cleaned++;
          } else {
            timers.set("ring", call.id, remaining, () => service.markMissed(call.id));
          }
        } else {
          const base = (call.answeredAt ?? call.startedAt).getTime();
          const remaining = base + env.MAX_CALL_DURATION_MS - now;
          if (remaining <= 0) {
            await service.endCall(call.id, "SERVER_RESTART");
            cleaned++;
          } else {
            timers.set("maxDuration", call.id, remaining, () =>
              service.endCall(call.id, "MAX_DURATION"),
            );
          }
        }
      }
      if (cleaned > 0) logger.info({ cleaned }, "recovered stale calls");
      return cleaned;
    },
  };

  return service;
}
