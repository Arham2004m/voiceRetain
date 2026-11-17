import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CallDetailDTO, TranscriptTurnDTO } from "@voiceretain/shared";
import { ApiClientError, api } from "@/lib/api";
import { useCallDetail } from "../useCallDetail";

const h = vi.hoisted(() => {
  type Handler = (payload: never) => void;
  const socket = {
    connected: true,
    handlers: {} as Record<string, Handler[]>,
    on(event: string, fn: Handler) {
      (this.handlers[event] ??= []).push(fn);
      return this;
    },
    off(event: string, fn: Handler) {
      this.handlers[event] = (this.handlers[event] ?? []).filter((f) => f !== fn);
      return this;
    },
    emit(_event: string, ...args: unknown[]) {
      const ack = args[args.length - 1];
      if (typeof ack === "function") (ack as (r: unknown) => void)({ ok: true });
      return this;
    },
    trigger(event: string, payload?: unknown) {
      for (const fn of this.handlers[event] ?? []) (fn as (p: unknown) => void)(payload);
    },
    reset() {
      this.handlers = {};
    },
  };
  return { socket };
});

vi.mock("@/lib/socket", () => ({ getSocket: () => h.socket }));
vi.mock("@/lib/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/api")>();
  return { ...original, api: { getCall: vi.fn() } };
});

const getCall = vi.mocked(api.getCall);

const turn = (id: string, text: string, callId = "c1"): TranscriptTurnDTO => ({
  id,
  callId,
  speaker: "AGENT",
  text,
  latencyMs: 500,
  createdAt: `2026-11-17T10:00:0${id}.000Z`,
});

const detail = (over: Partial<CallDetailDTO> = {}): CallDetailDTO => ({
  id: "c1",
  cartId: "cart1",
  customerName: "Rohan",
  customerPhone: "9876543210",
  cartTotalPaise: 149900,
  status: "IN_PROGRESS",
  outcome: "PENDING",
  sentiment: null,
  objection: null,
  summary: null,
  durationSec: null,
  startedAt: "2026-11-17T10:00:00.000Z",
  endReason: null,
  answeredAt: null,
  endedAt: null,
  avgLatencyMs: null,
  turns: [turn("1", "Hi")],
  vouchers: [],
  order: null,
  ...over,
});

beforeEach(() => {
  h.socket.reset();
  getCall.mockReset().mockResolvedValue(detail());
});

describe("useCallDetail", () => {
  it("loads the call", async () => {
    const { result } = renderHook(() => useCallDetail("c1"));
    await waitFor(() => expect(result.current.call?.customerName).toBe("Rohan"));
    expect(getCall).toHaveBeenCalledWith("c1");
    expect(result.current.call?.turns).toHaveLength(1);
  });

  it("adds turns for this call as they happen, once each, and ignores other calls", async () => {
    const { result } = renderHook(() => useCallDetail("c1"));
    await waitFor(() => expect(result.current.call).toBeDefined());
    act(() => h.socket.trigger("dashboard:turn", { callId: "c1", turn: turn("2", "Shipping?") }));
    act(() => h.socket.trigger("dashboard:turn", { callId: "c1", turn: turn("2", "Shipping?") }));
    act(() =>
      h.socket.trigger("dashboard:turn", { callId: "other", turn: turn("3", "No", "other") }),
    );
    expect(result.current.call?.turns.map((t) => t.text)).toEqual(["Hi", "Shipping?"]);
  });

  it("reloads the whole call when it changes, so outcome, vouchers and order appear", async () => {
    const { result } = renderHook(() => useCallDetail("c1"));
    await waitFor(() => expect(result.current.call).toBeDefined());

    getCall.mockResolvedValue(
      detail({ status: "ENDED", outcome: "RECOVERED", summary: "Said yes." }),
    );
    act(() =>
      h.socket.trigger("dashboard:call-updated", {
        id: "c1",
        status: "ENDED",
        outcome: "RECOVERED",
      }),
    );
    await waitFor(() => expect(result.current.call?.outcome).toBe("RECOVERED"));
    expect(result.current.call?.summary).toBe("Said yes.");
  });

  it("does not reload for a different call", async () => {
    const { result } = renderHook(() => useCallDetail("c1"));
    await waitFor(() => expect(result.current.call).toBeDefined());
    getCall.mockClear();
    act(() => h.socket.trigger("dashboard:call-updated", { id: "other", status: "ENDED" }));
    expect(getCall).not.toHaveBeenCalled();
  });

  it("follows the call when the page moves to a different call", async () => {
    const { result, rerender } = renderHook(({ id }) => useCallDetail(id), {
      initialProps: { id: "c1" },
    });
    await waitFor(() => expect(result.current.call?.id).toBe("c1"));

    getCall.mockResolvedValue(detail({ id: "c2", turns: [] }));
    rerender({ id: "c2" });
    await waitFor(() => expect(result.current.call?.id).toBe("c2"));

    act(() =>
      h.socket.trigger("dashboard:turn", { callId: "c1", turn: turn("5", "old call", "c1") }),
    );
    act(() =>
      h.socket.trigger("dashboard:turn", { callId: "c2", turn: turn("6", "new call", "c2") }),
    );
    expect(result.current.call?.turns.map((t) => t.text)).toEqual(["new call"]);
  });

  it("says the call was not found for a 404", async () => {
    getCall.mockRejectedValue(new ApiClientError(404, "NOT_FOUND", "Call not found"));
    const { result } = renderHook(() => useCallDetail("nope"));
    await waitFor(() => expect(result.current.notFound).toBe(true));
  });

  it("explains any other failure", async () => {
    getCall.mockRejectedValue(new Error("Can't reach ShopNest right now."));
    const { result } = renderHook(() => useCallDetail("c1"));
    await waitFor(() => expect(result.current.error).toBe("Can't reach ShopNest right now."));
    expect(result.current.notFound).toBe(false);
  });
});
