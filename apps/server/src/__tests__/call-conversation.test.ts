import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Agent, AgentTurnResult, Analyzer, CallAnalysis } from "../agent/agent.types";
import { createCallService, type CallService } from "../calls/call.service";
import { createFakeEmitter } from "../realtime/emitter";
import { FakeCallTimers } from "./setup/fake-timers";
import { makeCart } from "./setup/fixtures";
import { createTestContext } from "./setup/test-app";

const ctx = createTestContext();
const PHONE = "9876543210";

let emitter: ReturnType<typeof createFakeEmitter>;
let timers: FakeCallTimers;
let service: CallService;
const metrics = { schedule: vi.fn() };
const runTurn = vi.fn<Agent["runTurn"]>();
const analyze = vi.fn<Analyzer["analyze"]>();

const reply = (over: Partial<AgentTurnResult> = {}): AgentTurnResult => ({
  replyText: "Got it. Is it the price or the delivery?",
  endsCall: false,
  latencyMs: 0,
  failed: false,
  ...over,
});
const analysis = (over: Partial<CallAnalysis> = {}): CallAnalysis => ({
  sentiment: "NEUTRAL",
  objection: "SHIPPING_COST",
  intent: "UNDECIDED",
  summary: "Customer worried about shipping.",
  ...over,
});

beforeEach(async () => {
  await ctx.reset();
  emitter = createFakeEmitter();
  timers = new FakeCallTimers();
  metrics.schedule.mockReset();
  runTurn.mockReset().mockResolvedValue(reply());
  analyze.mockReset().mockResolvedValue(analysis());
  service = createCallService({
    db: ctx.prisma,
    redis: ctx.redis,
    emitter,
    timers,
    env: ctx.env,
    agent: { runTurn },
    analyzer: { analyze },
    metrics,
  });
});
afterAll(() => ctx.close());

async function liveCall() {
  const { cartId } = await makeCart(ctx.prisma);
  const call = await service.startCall(cartId);
  await service.answerCall(call.id, PHONE);
  return { cartId, callId: call.id };
}

const events = (name: string) => emitter.emissions.filter((e) => e.event === name);
const turnsOf = (callId: string) =>
  ctx.prisma.transcriptTurn.findMany({ where: { callId }, orderBy: { createdAt: "asc" } });

describe("handleUtterance", () => {
  it("stores the customer and agent turns in order and emits the reply", async () => {
    const { callId } = await liveCall();
    runTurn.mockResolvedValue(reply({ replyText: "Which part of it?" }));
    await service.handleUtterance(callId, PHONE, "the shipping was too expensive");

    const turns = await turnsOf(callId);
    expect(turns.map((t) => [t.speaker, t.text])).toEqual([
      ["AGENT", expect.stringContaining("Hi Rohan")],
      ["CUSTOMER", "the shipping was too expensive"],
      ["AGENT", "Which part of it?"],
    ]);
    expect(turns[2]?.latencyMs).toBeGreaterThanOrEqual(0);
    expect(events("call:agent-reply")[0]).toMatchObject({
      phone: PHONE,
      payload: { callId, text: "Which part of it?", endsCall: false },
    });
    expect(events("dashboard:turn")).toHaveLength(3);
  });

  it("includes the voucher card in the reply when one was issued this turn", async () => {
    const { callId, cartId } = await liveCall();
    const voucher = {
      code: "VR-8KQ2-X7MD",
      percent: 10,
      expiresAt: "2030-01-01T00:00:00.000Z",
      cartId,
    };
    runTurn.mockResolvedValue(reply({ voucher }));
    await service.handleUtterance(callId, PHONE, "ship");
    expect(events("call:agent-reply")[0]?.payload).toMatchObject({ voucher });
  });

  it("ignores blank utterances without calling the agent", async () => {
    const { callId } = await liveCall();
    await service.handleUtterance(callId, PHONE, "   ");
    expect(runTurn).not.toHaveBeenCalled();
    expect(await turnsOf(callId)).toHaveLength(1);
  });

  it("truncates a 600-character utterance to 500", async () => {
    const { callId } = await liveCall();
    await service.handleUtterance(callId, PHONE, "a".repeat(600));
    expect(runTurn.mock.calls[0]?.[0].customerText).toHaveLength(500);
    const turns = await turnsOf(callId);
    expect(turns[1]?.text).toHaveLength(500);
  });

  it("rejects an utterance from the wrong phone", async () => {
    const { callId } = await liveCall();
    await expect(service.handleUtterance(callId, "9123456789", "hi")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("processes overlapping utterances in order", async () => {
    const { callId } = await liveCall();
    const order: string[] = [];
    runTurn.mockImplementation(async ({ customerText }) => {
      order.push(`start:${customerText}`);
      await new Promise((r) => setTimeout(r, customerText === "first" ? 60 : 5));
      order.push(`end:${customerText}`);
      return reply({ replyText: `re:${customerText}` });
    });
    await Promise.all([
      service.handleUtterance(callId, PHONE, "first"),
      service.handleUtterance(callId, PHONE, "second"),
    ]);
    expect(order).toEqual(["start:first", "end:first", "start:second", "end:second"]);
    const texts = (await turnsOf(callId)).map((t) => t.text);
    expect(texts.slice(1)).toEqual(["first", "re:first", "second", "re:second"]);
  });

  it("passes the consecutive failure count to the agent and resets it on success", async () => {
    const { callId } = await liveCall();
    runTurn
      .mockResolvedValueOnce(reply({ failed: true }))
      .mockResolvedValueOnce(reply({ failed: true }))
      .mockResolvedValueOnce(reply({ failed: false }))
      .mockResolvedValueOnce(reply());
    for (const t of ["a", "b", "c", "d"]) await service.handleUtterance(callId, PHONE, t);
    expect(runTurn.mock.calls.map((c) => c[0].consecutiveFailures)).toEqual([0, 1, 2, 0]);
  });

  it("ends the call after emitting the reply when the agent ends it", async () => {
    const { callId } = await liveCall();
    runTurn.mockResolvedValue(reply({ replyText: "Goodbye!", endsCall: true }));
    await service.handleUtterance(callId, PHONE, "okay will buy");
    const names = emitter.emissions.map((e) => e.event);
    expect(names.indexOf("call:agent-reply")).toBeGreaterThan(-1);
    expect(names.indexOf("call:ended")).toBeGreaterThan(names.indexOf("call:agent-reply"));
    const row = await ctx.prisma.callLog.findUniqueOrThrow({ where: { id: callId } });
    expect(row.status).toBe("ENDED");
    expect(row.endReason).toBe("AGENT_ENDED");
  });

  it("uses LLM_FAILURE as the end reason when the agent gave up", async () => {
    const { callId } = await liveCall();
    runTurn.mockResolvedValue(reply({ endsCall: true, endReason: "LLM_FAILURE", failed: true }));
    await service.handleUtterance(callId, PHONE, "hello");
    const row = await ctx.prisma.callLog.findUniqueOrThrow({ where: { id: callId } });
    expect(row.endReason).toBe("LLM_FAILURE");
  });
});

describe("endCall", () => {
  it("computes duration, latency and analysis, decides the outcome and emits", async () => {
    const { callId } = await liveCall();
    await ctx.prisma.callLog.update({
      where: { id: callId },
      data: { answeredAt: new Date(Date.now() - 42_000) },
    });
    await ctx.prisma.transcriptTurn.createMany({
      data: [
        { callId, speaker: "CUSTOMER", text: "hi" },
        { callId, speaker: "AGENT", text: "a", latencyMs: 1000 },
        { callId, speaker: "AGENT", text: "b", latencyMs: 2000 },
      ],
    });
    analyze.mockResolvedValue(analysis({ sentiment: "POSITIVE", intent: "WILL_PURCHASE" }));
    await service.endCall(callId, "CUSTOMER_HANGUP");

    const row = await ctx.prisma.callLog.findUniqueOrThrow({ where: { id: callId } });
    expect(row.status).toBe("ENDED");
    expect(row.endReason).toBe("CUSTOMER_HANGUP");
    expect(row.durationSec).toBeGreaterThanOrEqual(42);
    expect(row.durationSec).toBeLessThan(50);
    expect(row.avgLatencyMs).toBe(1500);
    expect(row.sentiment).toBe("POSITIVE");
    expect(row.objection).toBe("SHIPPING_COST");
    expect(row.summary).toBe("Customer worried about shipping.");
    expect(row.outcome).toBe("ACCEPTED_OFFER");
    expect(events("call:ended")[0]).toMatchObject({
      phone: PHONE,
      payload: { callId, outcome: "ACCEPTED_OFFER" },
    });
    expect(timers.has("maxDuration", callId)).toBe(false);
  });

  it("treats an issued voucher as an accepted offer when the customer is undecided", async () => {
    const { callId, cartId } = await liveCall();
    await ctx.prisma.voucher.create({
      data: {
        code: "VR-AAAA-BBBB",
        percent: 10,
        cartId,
        callId,
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });
    await service.endCall(callId, "CUSTOMER_HANGUP");
    const row = await ctx.prisma.callLog.findUniqueOrThrow({ where: { id: callId } });
    expect(row.outcome).toBe("ACCEPTED_OFFER");
  });

  it("falls back to UNDECIDED when analysis fails", async () => {
    const { callId } = await liveCall();
    analyze.mockRejectedValue(new Error("llm down"));
    await service.endCall(callId, "CUSTOMER_HANGUP");
    const row = await ctx.prisma.callLog.findUniqueOrThrow({ where: { id: callId } });
    expect(row.outcome).toBe("UNDECIDED");
    expect(row.summary).toBe("Analysis unavailable.");
  });

  it("is idempotent: hanging up twice analyzes and emits once", async () => {
    const { callId } = await liveCall();
    await Promise.all([
      service.endCall(callId, "CUSTOMER_HANGUP"),
      service.endCall(callId, "CUSTOMER_HANGUP"),
    ]);
    await service.endCall(callId, "CUSTOMER_HANGUP");
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(events("call:ended")).toHaveLength(1);
  });

  it("ends the call when the max duration timer fires", async () => {
    const { callId } = await liveCall();
    await timers.fire("maxDuration", callId);
    const row = await ctx.prisma.callLog.findUniqueOrThrow({ where: { id: callId } });
    expect(row.status).toBe("ENDED");
    expect(row.endReason).toBe("MAX_DURATION");
  });
});

describe("disconnect grace", () => {
  it("starts a grace timer on disconnect and ends the call with UNDECIDED when it fires", async () => {
    const { callId } = await liveCall();
    await service.handleDisconnect(PHONE);
    expect(timers.msOf("disconnect", callId)).toBe(ctx.env.DISCONNECT_GRACE_MS);
    await timers.fire("disconnect", callId);
    const row = await ctx.prisma.callLog.findUniqueOrThrow({ where: { id: callId } });
    expect(row.status).toBe("ENDED");
    expect(row.endReason).toBe("DISCONNECTED");
    expect(row.outcome).toBe("UNDECIDED");
  });

  it("keeps the call when the same phone reconnects within the grace period", async () => {
    const { callId } = await liveCall();
    await service.handleDisconnect(PHONE);
    await service.handleReconnect(PHONE);
    expect(timers.has("disconnect", callId)).toBe(false);
    const row = await ctx.prisma.callLog.findUniqueOrThrow({ where: { id: callId } });
    expect(row.status).toBe("IN_PROGRESS");
  });

  it("does nothing when the phone has no call in progress", async () => {
    await expect(service.handleDisconnect(PHONE)).resolves.toBeUndefined();
  });
});
