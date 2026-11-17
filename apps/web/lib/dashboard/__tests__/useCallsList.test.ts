import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CallSummaryDTO } from "@voiceretain/shared";
import { api } from "@/lib/api";
import { useCallsList } from "../useCallsList";

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
vi.mock("@/lib/api", () => ({ api: { listCalls: vi.fn() } }));

const listCalls = vi.mocked(api.listCalls);

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

beforeEach(() => {
  h.socket.reset();
  listCalls.mockReset().mockResolvedValue({ items: [], nextCursor: null });
});

describe("useCallsList", () => {
  it("loads the first page of 20 with the filters", async () => {
    listCalls.mockResolvedValue({ items: [call("a"), call("b")], nextCursor: "b" });
    const { result } = renderHook(() => useCallsList({ outcome: "RECOVERED" }));
    await waitFor(() => expect(result.current.calls).toHaveLength(2));
    expect(listCalls).toHaveBeenCalledWith({ limit: 20, outcome: "RECOVERED" });
    expect(result.current.hasMore).toBe(true);
    expect(result.current.loading).toBe(false);
  });

  it("loads the next page with the cursor and appends it", async () => {
    listCalls.mockResolvedValueOnce({ items: [call("a")], nextCursor: "a" });
    listCalls.mockResolvedValueOnce({ items: [call("b")], nextCursor: null });
    const { result } = renderHook(() => useCallsList({}));
    await waitFor(() => expect(result.current.calls).toHaveLength(1));

    await act(async () => result.current.loadMore());
    expect(listCalls).toHaveBeenLastCalledWith({ limit: 20, cursor: "a" });
    expect(result.current.calls.map((c) => c.id)).toEqual(["a", "b"]);
    expect(result.current.hasMore).toBe(false);
  });

  it("starts again from the first page when a filter changes", async () => {
    listCalls.mockResolvedValue({ items: [call("a")], nextCursor: null });
    const { result, rerender } = renderHook(({ f }) => useCallsList(f), {
      initialProps: { f: {} as Parameters<typeof useCallsList>[0] },
    });
    await waitFor(() => expect(result.current.calls).toHaveLength(1));

    listCalls.mockResolvedValue({ items: [call("x"), call("y")], nextCursor: null });
    rerender({ f: { sentiment: "NEGATIVE" } });
    await waitFor(() => expect(result.current.calls.map((c) => c.id)).toEqual(["x", "y"]));
    expect(listCalls).toHaveBeenLastCalledWith({ limit: 20, sentiment: "NEGATIVE" });
  });

  it("updates a row in place when its call changes", async () => {
    listCalls.mockResolvedValue({ items: [call("a"), call("b")], nextCursor: null });
    const { result } = renderHook(() => useCallsList({}));
    await waitFor(() => expect(result.current.calls).toHaveLength(2));
    act(() => h.socket.trigger("dashboard:call-updated", call("b", { outcome: "RECOVERED" })));
    expect(result.current.calls.map((c) => [c.id, c.outcome])).toEqual([
      ["a", "UNDECIDED"],
      ["b", "RECOVERED"],
    ]);
  });

  it("puts a new call at the top when it matches the filters", async () => {
    listCalls.mockResolvedValue({ items: [call("a", { outcome: "RECOVERED" })], nextCursor: null });
    const { result } = renderHook(() => useCallsList({ outcome: "RECOVERED" }));
    await waitFor(() => expect(result.current.calls).toHaveLength(1));

    act(() => h.socket.trigger("dashboard:call-updated", call("new", { outcome: "RECOVERED" })));
    expect(result.current.calls.map((c) => c.id)).toEqual(["new", "a"]);
  });

  it("leaves a new call out when it does not match the filters", async () => {
    listCalls.mockResolvedValue({ items: [call("a", { outcome: "RECOVERED" })], nextCursor: null });
    const { result } = renderHook(() => useCallsList({ outcome: "RECOVERED" }));
    await waitFor(() => expect(result.current.calls).toHaveLength(1));
    act(() => h.socket.trigger("dashboard:call-updated", call("n", { outcome: "DECLINED" })));
    expect(result.current.calls.map((c) => c.id)).toEqual(["a"]);
  });

  it("does not add new calls to a single customer's list (it cannot tell whose they are)", async () => {
    listCalls.mockResolvedValue({ items: [call("a")], nextCursor: null });
    const { result } = renderHook(() => useCallsList({ customerId: "u1" }));
    await waitFor(() => expect(result.current.calls).toHaveLength(1));
    act(() => h.socket.trigger("dashboard:call-updated", call("n")));
    expect(result.current.calls.map((c) => c.id)).toEqual(["a"]);
  });

  it("explains a failed load", async () => {
    listCalls.mockRejectedValue(new Error("Can't reach ShopNest right now."));
    const { result } = renderHook(() => useCallsList({}));
    await waitFor(() => expect(result.current.error).toBe("Can't reach ShopNest right now."));
  });
});
