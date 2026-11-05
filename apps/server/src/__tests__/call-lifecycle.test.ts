import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createCallService, CallError, type CallService } from "../calls/call.service";
import { createFakeEmitter } from "../realtime/emitter";
import type { Agent, Analyzer } from "../agent/agent.types";
import { FakeCallTimers } from "./setup/fake-timers";
import { makeCart } from "./setup/fixtures";
import { createTestContext } from "./setup/test-app";

const ctx = createTestContext();
let emitter: ReturnType<typeof createFakeEmitter>;
let timers: FakeCallTimers;
let service: CallService;
const metrics = { schedule: vi.fn() };

const agent: Agent = { runTurn: vi.fn() };
const analyzer: Analyzer = { analyze: vi.fn() };

beforeEach(async () => {
  await ctx.reset();
  emitter = createFakeEmitter();
  timers = new FakeCallTimers();
  metrics.schedule.mockReset();
  service = createCallService({
    db: ctx.prisma,
    redis: ctx.redis,
    emitter,
    timers,
    env: ctx.env,
    agent,
    analyzer,
    metrics,
  });
});
afterAll(() => ctx.close());

const events = (name: string) => emitter.emissions.filter((e) => e.event === name);

describe("startCall", () => {
  it("creates a RINGING call and emits call:incoming to the phone room", async () => {
    const { cartId } = await makeCart(ctx.prisma);
    const call = await service.startCall(cartId);
    expect(call.status).toBe("RINGING");
    const incoming = events("call:incoming");
    expect(incoming).toHaveLength(1);
    expect(incoming[0]).toMatchObject({
      target: "phone",
      phone: "9876543210",
      payload: {
        callId: call.id,
        customerName: "Rohan",
        cartId,
        subtotalPaise: 149900,
        itemCount: 1,
      },
    });
    expect(events("dashboard:call-updated")).toHaveLength(1);
    expect(timers.msOf("ring", call.id)).toBe(ctx.env.RING_TIMEOUT_MS);
    expect(metrics.schedule).toHaveBeenCalled();
  });

  it("refuses a second active call for the same customer (database-enforced)", async () => {
    const first = await makeCart(ctx.prisma);
    await service.startCall(first.cartId);
    const second = await makeCart(ctx.prisma);
    await expect(service.startCall(second.cartId)).rejects.toMatchObject({ code: "P2002" });
  });
});

describe("answerCall", () => {
  it("sets IN_PROGRESS and returns the templated greeting, stored as an AGENT turn", async () => {
    const { cartId } = await makeCart(ctx.prisma);
    const call = await service.startCall(cartId);
    const reply = await service.answerCall(call.id, "9876543210");
    expect(reply.text).toMatch(
      /^Hi Rohan, this is Aria from ShopNest\. I noticed you left Wireless Earbuds Pro in your cart\. /,
    );
    expect(reply.endsCall).toBe(false);
    const row = await ctx.prisma.callLog.findUniqueOrThrow({
      where: { id: call.id },
      include: { turns: true },
    });
    expect(row.status).toBe("IN_PROGRESS");
    expect(row.answeredAt).not.toBeNull();
    expect(row.turns).toHaveLength(1);
    expect(row.turns[0]?.speaker).toBe("AGENT");
    expect(timers.has("ring", call.id)).toBe(false);
    expect(timers.msOf("maxDuration", call.id)).toBe(ctx.env.MAX_CALL_DURATION_MS);
    expect(agent.runTurn).not.toHaveBeenCalled();
  });

  it("rejects an answer from the wrong phone", async () => {
    const { cartId } = await makeCart(ctx.prisma);
    const call = await service.startCall(cartId);
    await expect(service.answerCall(call.id, "9123456789")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    const row = await ctx.prisma.callLog.findUniqueOrThrow({ where: { id: call.id } });
    expect(row.status).toBe("RINGING");
  });

  it("rejects an answer after the call was missed", async () => {
    const { cartId } = await makeCart(ctx.prisma);
    const call = await service.startCall(cartId);
    await timers.fire("ring", call.id);
    await expect(service.answerCall(call.id, "9876543210")).rejects.toBeInstanceOf(CallError);
  });

  it("rejects answering twice", async () => {
    const { cartId } = await makeCart(ctx.prisma);
    const call = await service.startCall(cartId);
    await service.answerCall(call.id, "9876543210");
    await expect(service.answerCall(call.id, "9876543210")).rejects.toMatchObject({
      code: "BAD_STATE",
    });
  });
});

describe("missed and declined calls", () => {
  it("ring timeout marks MISSED with NO_ANSWER and cancels the ring on the phone", async () => {
    const { cartId } = await makeCart(ctx.prisma);
    const call = await service.startCall(cartId);
    await timers.fire("ring", call.id);
    const row = await ctx.prisma.callLog.findUniqueOrThrow({ where: { id: call.id } });
    expect(row.status).toBe("MISSED");
    expect(row.outcome).toBe("NO_ANSWER");
    expect(row.endedAt).not.toBeNull();
    expect(events("call:ring-cancelled")[0]).toMatchObject({
      phone: "9876543210",
      payload: { callId: call.id },
    });
  });

  it("decline sets ENDED with DECLINED", async () => {
    const { cartId } = await makeCart(ctx.prisma);
    const call = await service.startCall(cartId);
    await service.declineCall(call.id, "9876543210");
    const row = await ctx.prisma.callLog.findUniqueOrThrow({ where: { id: call.id } });
    expect(row.status).toBe("ENDED");
    expect(row.outcome).toBe("DECLINED");
    expect(timers.has("ring", call.id)).toBe(false);
    expect(events("call:ended")[0]).toMatchObject({
      payload: { callId: call.id, outcome: "DECLINED" },
    });
  });
});

describe("getActiveCallForPhone", () => {
  it("returns the ringing call for a phone, and null otherwise", async () => {
    const { cartId } = await makeCart(ctx.prisma);
    expect(await service.getActiveCallForPhone("9876543210")).toBeNull();
    const call = await service.startCall(cartId);
    expect(await service.getActiveCallForPhone("9876543210")).toMatchObject({ callId: call.id });
    expect(await service.getActiveCallForPhone("9123456789")).toBeNull();
  });
});

describe("recoverStaleCalls", () => {
  const ago = (ms: number) => new Date(Date.now() - ms);

  async function seedCall(data: {
    status: "RINGING" | "IN_PROGRESS";
    startedAt: Date;
    answeredAt?: Date;
    phone: string;
  }) {
    const { cartId, customerId } = await makeCart(ctx.prisma, { phone: data.phone });
    return ctx.prisma.callLog.create({
      data: {
        cartId,
        customerId: customerId!,
        status: data.status,
        startedAt: data.startedAt,
        answeredAt: data.answeredAt ?? null,
      },
    });
  }

  it("ends old IN_PROGRESS calls with SERVER_RESTART", async () => {
    (analyzer.analyze as ReturnType<typeof vi.fn>).mockResolvedValue({
      sentiment: "NEUTRAL",
      objection: "NONE",
      intent: "UNDECIDED",
      summary: "x",
    });
    const old = await seedCall({
      status: "IN_PROGRESS",
      startedAt: ago(ctx.env.MAX_CALL_DURATION_MS + 60_000),
      answeredAt: ago(ctx.env.MAX_CALL_DURATION_MS + 50_000),
      phone: "9876543210",
    });
    expect(await service.recoverStaleCalls()).toBe(1);
    const row = await ctx.prisma.callLog.findUniqueOrThrow({ where: { id: old.id } });
    expect(row.status).toBe("ENDED");
    expect(row.endReason).toBe("SERVER_RESTART");
  });

  it("misses stale RINGING calls", async () => {
    const stale = await seedCall({
      status: "RINGING",
      startedAt: ago(ctx.env.RING_TIMEOUT_MS + 5_000),
      phone: "9876543210",
    });
    expect(await service.recoverStaleCalls()).toBe(1);
    const row = await ctx.prisma.callLog.findUniqueOrThrow({ where: { id: stale.id } });
    expect(row.status).toBe("MISSED");
    expect(row.outcome).toBe("NO_ANSWER");
  });

  it("re-arms timers for young active calls", async () => {
    const ringing = await seedCall({
      status: "RINGING",
      startedAt: ago(5_000),
      phone: "9876543210",
    });
    const live = await seedCall({
      status: "IN_PROGRESS",
      startedAt: ago(20_000),
      answeredAt: ago(10_000),
      phone: "9123456780",
    });
    expect(await service.recoverStaleCalls()).toBe(0);
    expect(timers.has("ring", ringing.id)).toBe(true);
    expect(timers.has("maxDuration", live.id)).toBe(true);
    expect(timers.msOf("maxDuration", live.id)!).toBeLessThan(ctx.env.MAX_CALL_DURATION_MS);
  });
});
