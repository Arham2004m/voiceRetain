import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CallDetailDTO, CallSummaryDTO, DashboardMetrics } from "@voiceretain/shared";
import { api } from "@/lib/api";
import { useDashboardSocket } from "../useDashboardSocket";

const h = vi.hoisted(() => {
  type Handler = (payload: never) => void;
  const socket = {
    connected: true,
    handlers: {} as Record<string, Handler[]>,
    emitted: [] as { event: string; payload: unknown }[],
    on(event: string, fn: Handler) {
      (this.handlers[event] ??= []).push(fn);
      return this;
    },
    off(event: string, fn: Handler) {
      this.handlers[event] = (this.handlers[event] ?? []).filter((f) => f !== fn);
      return this;
    },
    emit(event: string, ...args: unknown[]) {
      const ack =
        typeof args[args.length - 1] === "function"
          ? (args.pop() as (r: unknown) => void)
          : undefined;
      this.emitted.push({ event, payload: args[0] });
      ack?.({ ok: true });
      return this;
    },
    trigger(event: string, payload?: unknown) {
      for (const fn of this.handlers[event] ?? []) (fn as (p: unknown) => void)(payload);
    },
    reset() {
      this.connected = true;
      this.handlers = {};
      this.emitted = [];
    },
  };
  return { socket };
});

vi.mock("@/lib/socket", () => ({ getSocket: () => h.socket }));
vi.mock("@/lib/api", () => ({
  api: { getMetrics: vi.fn(), listCalls: vi.fn(), getCall: vi.fn() },
}));

const metrics = (over: Partial<DashboardMetrics> = {}): DashboardMetrics => ({
  abandonedCarts: 2,
  callsPlaced: 2,
  answerRate: 1,
  recoveredCarts: 1,
  recoveryRate: 0.5,
  revenueRecoveredPaise: 144810,
  avgLatencyMs: 1200,
  sentiment: { POSITIVE: 1, NEUTRAL: 0, NEGATIVE: 0 },
  last7Days: [],
  ...over,
});

const call = (id: string, over: Partial<CallSummaryDTO> = {}): CallSummaryDTO => ({
  id,
  cartId: `cart-${id}`,
  customerName: `Customer ${id}`,
  customerPhone: "9876543210",
  cartTotalPaise: 149900,
  status: "ENDED",
  outcome: "UNDECIDED",
  sentiment: null,
  objection: null,
  summary: null,
  durationSec: null,
  startedAt: "2026-11-17T10:00:00.000Z",
  ...over,
});

const detail = (id: string, turns: CallDetailDTO["turns"] = []): CallDetailDTO => ({
  ...call(id, { status: "IN_PROGRESS" }),
  endReason: null,
  answeredAt: null,
  endedAt: null,
  avgLatencyMs: null,
  turns,
  vouchers: [],
  order: null,
});

const turn = (
  id: string,
  callId: string,
  text = "hello",
  speaker: "AGENT" | "CUSTOMER" = "AGENT",
) => ({
  id,
  callId,
  speaker,
  text,
  latencyMs: null,
  createdAt: "2026-11-17T10:00:01.000Z",
});

const getMetrics = vi.mocked(api.getMetrics);
const listCalls = vi.mocked(api.listCalls);
const getCall = vi.mocked(api.getCall);

beforeEach(() => {
  h.socket.reset();
  getMetrics.mockReset().mockResolvedValue(metrics());
  listCalls.mockReset().mockResolvedValue({ items: [], nextCursor: null });
  getCall.mockReset();
});

async function loaded() {
  const hook = renderHook(() => useDashboardSocket());
  await waitFor(() => expect(hook.result.current.metrics).toBeDefined());
  return hook;
}

describe("useDashboardSocket", () => {
  it("loads the metrics and the ten most recent calls", async () => {
    listCalls.mockResolvedValue({ items: [call("a"), call("b")], nextCursor: null });
    const { result } = await loaded();
    expect(listCalls).toHaveBeenCalledWith({ limit: 10 });
    expect(result.current.metrics?.revenueRecoveredPaise).toBe(144810);
    expect(result.current.recentCalls.map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("joins the dashboard room, and again after a reconnect", async () => {
    await loaded();
    expect(h.socket.emitted.filter((e) => e.event === "dashboard:join")).toHaveLength(1);
    act(() => h.socket.trigger("connect"));
    expect(h.socket.emitted.filter((e) => e.event === "dashboard:join")).toHaveLength(2);
  });

  it("has no live call when nothing is active", async () => {
    listCalls.mockResolvedValue({ items: [call("a")], nextCursor: null });
    const { result } = await loaded();
    expect(result.current.liveCall).toBeUndefined();
  });

  it("starts with the call that is in progress, including its transcript so far", async () => {
    listCalls.mockResolvedValue({
      items: [call("a"), call("live", { status: "IN_PROGRESS" })],
      nextCursor: null,
    });
    getCall.mockResolvedValue(detail("live", [turn("t1", "live", "Hi Rohan")]));
    const { result } = await loaded();
    await waitFor(() => expect(result.current.liveCall?.turns).toHaveLength(1));
    expect(result.current.liveCall?.call.id).toBe("live");
    expect(result.current.liveCall?.turns[0]?.text).toBe("Hi Rohan");
  });

  it("appends a turn that belongs to the live call and ignores one for another call", async () => {
    listCalls.mockResolvedValue({
      items: [call("live", { status: "IN_PROGRESS" })],
      nextCursor: null,
    });
    getCall.mockResolvedValue(detail("live"));
    const { result } = await loaded();
    await waitFor(() => expect(result.current.liveCall).toBeDefined());

    act(() =>
      h.socket.trigger("dashboard:turn", { callId: "live", turn: turn("t1", "live", "Hi") }),
    );
    act(() =>
      h.socket.trigger("dashboard:turn", { callId: "other", turn: turn("t2", "other", "Nope") }),
    );
    act(() =>
      h.socket.trigger("dashboard:turn", {
        callId: "live",
        turn: turn("t3", "live", "Shipping", "CUSTOMER"),
      }),
    );

    expect(result.current.liveCall?.turns.map((t) => t.text)).toEqual(["Hi", "Shipping"]);
  });

  it("does not show the same turn twice", async () => {
    listCalls.mockResolvedValue({
      items: [call("live", { status: "IN_PROGRESS" })],
      nextCursor: null,
    });
    getCall.mockResolvedValue(detail("live", [turn("t1", "live", "Hi")]));
    const { result } = await loaded();
    await waitFor(() => expect(result.current.liveCall?.turns).toHaveLength(1));
    act(() =>
      h.socket.trigger("dashboard:turn", { callId: "live", turn: turn("t1", "live", "Hi") }),
    );
    expect(result.current.liveCall?.turns).toHaveLength(1);
  });

  it("puts a new call at the top of the list and updates an existing one in place", async () => {
    listCalls.mockResolvedValue({ items: [call("a"), call("b")], nextCursor: null });
    const { result } = await loaded();

    act(() => h.socket.trigger("dashboard:call-updated", call("c", { status: "RINGING" })));
    expect(result.current.recentCalls.map((c) => c.id)).toEqual(["c", "a", "b"]);

    act(() => h.socket.trigger("dashboard:call-updated", call("a", { outcome: "RECOVERED" })));
    expect(result.current.recentCalls.map((c) => [c.id, c.outcome])).toEqual([
      ["c", "UNDECIDED"],
      ["a", "RECOVERED"],
      ["b", "UNDECIDED"],
    ]);
  });

  it("keeps only the ten newest calls", async () => {
    listCalls.mockResolvedValue({
      items: Array.from({ length: 10 }, (_, i) => call(`old${i}`)),
      nextCursor: null,
    });
    const { result } = await loaded();
    act(() => h.socket.trigger("dashboard:call-updated", call("new")));
    expect(result.current.recentCalls).toHaveLength(10);
    expect(result.current.recentCalls[0]?.id).toBe("new");
    expect(result.current.recentCalls.map((c) => c.id)).not.toContain("old9");
  });

  it("shows a ringing call as the live call and keeps it, marked ended, after it finishes", async () => {
    getCall.mockResolvedValue(detail("c"));
    const { result } = await loaded();
    act(() => h.socket.trigger("dashboard:call-updated", call("c", { status: "RINGING" })));
    expect(result.current.liveCall?.call.status).toBe("RINGING");

    act(() => h.socket.trigger("dashboard:turn", { callId: "c", turn: turn("t1", "c", "Hi") }));
    act(() =>
      h.socket.trigger(
        "dashboard:call-updated",
        call("c", { status: "ENDED", outcome: "ACCEPTED_OFFER" }),
      ),
    );
    expect(result.current.liveCall?.call).toMatchObject({
      status: "ENDED",
      outcome: "ACCEPTED_OFFER",
    });
    expect(result.current.liveCall?.turns).toHaveLength(1);
  });

  it("switches to the next call when a new one starts", async () => {
    getCall.mockImplementation(async (id) => detail(id));
    const { result } = await loaded();
    act(() => h.socket.trigger("dashboard:call-updated", call("one", { status: "ENDED" })));
    act(() => h.socket.trigger("dashboard:call-updated", call("two", { status: "RINGING" })));
    expect(result.current.liveCall?.call.id).toBe("two");
  });

  it("takes new metrics from the server and refreshes the call list", async () => {
    const { result } = await loaded();
    listCalls.mockResolvedValue({ items: [call("fresh")], nextCursor: null });
    act(() =>
      h.socket.trigger(
        "dashboard:metrics",
        metrics({ revenueRecoveredPaise: 999900, recoveredCarts: 5 }),
      ),
    );
    expect(result.current.metrics?.revenueRecoveredPaise).toBe(999900);
    await waitFor(() => expect(result.current.recentCalls.map((c) => c.id)).toEqual(["fresh"]));
  });

  it("reports whether it is connected", async () => {
    const { result } = await loaded();
    expect(result.current.connected).toBe(true);
    act(() => h.socket.trigger("disconnect"));
    expect(result.current.connected).toBe(false);
    act(() => h.socket.trigger("connect"));
    expect(result.current.connected).toBe(true);
  });

  it("explains a failed load", async () => {
    getMetrics.mockRejectedValue(new Error("Can't reach ShopNest right now."));
    const { result } = renderHook(() => useDashboardSocket());
    await waitFor(() => expect(result.current.error).toBe("Can't reach ShopNest right now."));
  });
});
