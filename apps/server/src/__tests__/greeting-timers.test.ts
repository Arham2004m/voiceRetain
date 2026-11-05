import { afterEach, describe, expect, it, vi } from "vitest";
import { buildGreeting } from "../calls/greeting";
import { CallTimers } from "../calls/call.timers";

describe("buildGreeting", () => {
  const ctx = (n: number) => ({
    customerName: "Rohan Mehta",
    items: Array.from({ length: n }, (_, i) => ({
      name: i === 0 ? "Wireless Earbuds Pro" : `Item ${i}`,
    })),
  });

  it("greets by first name with one item", () => {
    expect(buildGreeting(ctx(1))).toBe(
      "Hi Rohan, this is Aria from ShopNest. I noticed you left Wireless Earbuds Pro in your cart. Was there anything that stopped you from finishing your order?",
    );
  });
  it("says 'and 1 more item'", () => {
    expect(buildGreeting(ctx(2))).toContain("Wireless Earbuds Pro and 1 more item in your cart");
  });
  it("says 'and N more items'", () => {
    expect(buildGreeting(ctx(4))).toContain("Wireless Earbuds Pro and 3 more items in your cart");
  });
});

describe("CallTimers", () => {
  afterEach(() => vi.useRealTimers());

  it("fires after the delay and can be cleared", () => {
    vi.useFakeTimers();
    const timers = new CallTimers();
    const fired = vi.fn();
    timers.set("ring", "c1", 1000, fired);
    expect(timers.has("ring", "c1")).toBe(true);
    vi.advanceTimersByTime(999);
    expect(fired).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fired).toHaveBeenCalledTimes(1);
    expect(timers.has("ring", "c1")).toBe(false);

    timers.set("ring", "c2", 1000, fired);
    timers.clear("ring", "c2");
    vi.advanceTimersByTime(5000);
    expect(fired).toHaveBeenCalledTimes(1);
  });

  it("replaces a timer of the same kind and clears all kinds", () => {
    vi.useFakeTimers();
    const timers = new CallTimers();
    const first = vi.fn();
    const second = vi.fn();
    timers.set("ring", "c1", 1000, first);
    timers.set("ring", "c1", 1000, second);
    timers.set("maxDuration", "c1", 1000, first);
    timers.clearAll("c1");
    vi.advanceTimersByTime(2000);
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
  });
});
