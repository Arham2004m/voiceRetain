import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { getCallDetail, listCalls } from "../services/calls-query.service";
import { makeCart } from "./setup/fixtures";
import { createTestContext } from "./setup/test-app";

const ctx = createTestContext();
beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

let counter = 0;
async function makeCall(
  over: {
    startedAt?: Date;
    outcome?: "RECOVERED" | "ACCEPTED_OFFER" | "UNDECIDED" | "DECLINED" | "NO_ANSWER" | "PENDING";
    sentiment?: "POSITIVE" | "NEUTRAL" | "NEGATIVE";
    name?: string;
    phone?: string;
    customerId?: string;
  } = {},
) {
  counter++;
  const phone = over.phone ?? `90000${String(counter).padStart(5, "0")}`;
  const { cartId, customerId } = await makeCart(ctx.prisma, {
    phone,
    name: over.name ?? `Customer ${counter}`,
    status: "ABANDONED",
  });
  const call = await ctx.prisma.callLog.create({
    data: {
      cartId,
      customerId: over.customerId ?? customerId!,
      status: "ENDED",
      outcome: over.outcome ?? "UNDECIDED",
      sentiment: over.sentiment ?? null,
      ...(over.startedAt ? { startedAt: over.startedAt } : {}),
    },
  });
  return { callId: call.id, cartId, customerId: customerId! };
}

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);

describe("listCalls", () => {
  it("lists newest first with the customer and cart total", async () => {
    await makeCall({ startedAt: minutesAgo(30), name: "Older" });
    await makeCall({ startedAt: minutesAgo(5), name: "Newer" });
    const page = await listCalls(ctx.prisma, { limit: 20 });
    expect(page.items.map((c) => c.customerName)).toEqual(["Newer", "Older"]);
    expect(page.items[0]).toMatchObject({ cartTotalPaise: 149900, status: "ENDED" });
    expect(page.nextCursor).toBeNull();
  });

  it("pages with a cursor and never repeats or skips a call", async () => {
    for (let i = 0; i < 5; i++) await makeCall({ startedAt: minutesAgo(50 - i * 10) });
    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = await listCalls(ctx.prisma, { limit: 2, cursor });
      seen.push(...page.items.map((c) => c.id));
      cursor = page.nextCursor ?? undefined;
      pages++;
    } while (cursor);
    expect(pages).toBe(3);
    expect(new Set(seen).size).toBe(5);
  });

  it("stays stable when several calls share the same start time", async () => {
    const same = minutesAgo(10);
    for (let i = 0; i < 4; i++) await makeCall({ startedAt: same });
    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await listCalls(ctx.prisma, { limit: 1, cursor });
      seen.push(...page.items.map((c) => c.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(seen).toHaveLength(4);
    expect(new Set(seen).size).toBe(4);
  });

  it("filters by outcome and by sentiment", async () => {
    await makeCall({ outcome: "RECOVERED", sentiment: "POSITIVE" });
    await makeCall({ outcome: "DECLINED", sentiment: "NEGATIVE" });
    await makeCall({ outcome: "RECOVERED", sentiment: "NEUTRAL" });
    expect((await listCalls(ctx.prisma, { limit: 20, outcome: "RECOVERED" })).items).toHaveLength(
      2,
    );
    expect((await listCalls(ctx.prisma, { limit: 20, sentiment: "NEGATIVE" })).items).toHaveLength(
      1,
    );
    const both = await listCalls(ctx.prisma, {
      limit: 20,
      outcome: "RECOVERED",
      sentiment: "NEUTRAL",
    });
    expect(both.items).toHaveLength(1);
  });

  it("filters by customer", async () => {
    const a = await makeCall({ name: "Asha" });
    await makeCall({ name: "Bilal" });
    const page = await listCalls(ctx.prisma, { limit: 20, customerId: a.customerId });
    expect(page.items.map((c) => c.customerName)).toEqual(["Asha"]);
  });
});

describe("getCallDetail", () => {
  it("includes the transcript in order, the vouchers (even superseded) and the order", async () => {
    const { callId, cartId } = await makeCall({ outcome: "RECOVERED" });
    await ctx.prisma.callLog.update({
      where: { id: callId },
      data: { avgLatencyMs: 1500, summary: "Said yes." },
    });
    const t0 = Date.now();
    for (const [i, [speaker, text, latencyMs]] of (
      [
        ["AGENT", "Hi", null],
        ["CUSTOMER", "Shipping is high", null],
        ["AGENT", "10 percent?", 1800],
      ] as const
    ).entries()) {
      await ctx.prisma.transcriptTurn.create({
        data: { callId, speaker, text, latencyMs, createdAt: new Date(t0 + i * 1000) },
      });
    }
    const expires = new Date(Date.now() + 3600_000);
    await ctx.prisma.voucher.create({
      data: {
        code: "VR-AAAA-BBBB",
        percent: 10,
        status: "SUPERSEDED",
        cartId,
        callId,
        expiresAt: expires,
      },
    });
    const live = await ctx.prisma.voucher.create({
      data: {
        code: "VR-CCCC-DDDD",
        percent: 15,
        status: "REDEEMED",
        cartId,
        callId,
        expiresAt: expires,
      },
    });
    await ctx.prisma.order.create({
      data: {
        cartId,
        voucherId: live.id,
        subtotalPaise: 149900,
        discountPaise: 22485,
        totalPaise: 137315,
      },
    });

    const detail = await getCallDetail(ctx.prisma, callId);
    expect(detail.turns.map((t) => t.text)).toEqual(["Hi", "Shipping is high", "10 percent?"]);
    expect(detail.turns[2]?.latencyMs).toBe(1800);
    expect(detail.vouchers.map((v) => [v.code, v.status])).toEqual([
      ["VR-AAAA-BBBB", "SUPERSEDED"],
      ["VR-CCCC-DDDD", "REDEEMED"],
    ]);
    expect(detail.order).toMatchObject({
      totalPaise: 137315,
      discountPaise: 22485,
      voucherCode: "VR-CCCC-DDDD",
    });
    expect(detail).toMatchObject({
      avgLatencyMs: 1500,
      summary: "Said yes.",
      outcome: "RECOVERED",
    });
  });

  it("reports no order when none was placed", async () => {
    const { callId } = await makeCall();
    expect((await getCallDetail(ctx.prisma, callId)).order).toBeNull();
  });

  it("throws not found for an unknown call", async () => {
    await expect(getCallDetail(ctx.prisma, "nope")).rejects.toMatchObject({ status: 404 });
  });
});

describe("GET /api/calls", () => {
  it("returns a page with a cursor and accepts filters", async () => {
    await makeCall({ outcome: "RECOVERED" });
    await makeCall({ outcome: "RECOVERED" });
    await makeCall({ outcome: "DECLINED" });
    const res = await request(ctx.app).get("/api/calls").query({ limit: 1, outcome: "RECOVERED" });
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.nextCursor).toEqual(expect.any(String));
    const next = await request(ctx.app)
      .get("/api/calls")
      .query({ limit: 1, outcome: "RECOVERED", cursor: res.body.nextCursor });
    expect(next.body.items).toHaveLength(1);
    expect(next.body.nextCursor).toBeNull();
  });

  it("rejects an unknown outcome and an oversized limit with 400", async () => {
    expect((await request(ctx.app).get("/api/calls").query({ outcome: "WHATEVER" })).status).toBe(
      400,
    );
    expect((await request(ctx.app).get("/api/calls").query({ limit: 500 })).status).toBe(400);
  });
});

describe("GET /api/calls/:id", () => {
  it("returns the detail, or 404", async () => {
    const { callId } = await makeCall();
    const ok = await request(ctx.app).get(`/api/calls/${callId}`);
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ id: callId, turns: [], vouchers: [], order: null });
    expect((await request(ctx.app).get("/api/calls/nope")).status).toBe(404);
  });
});
