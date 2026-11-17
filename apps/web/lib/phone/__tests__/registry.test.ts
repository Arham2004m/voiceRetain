import { afterEach, describe, expect, it, vi } from "vitest";
import { PHONE_KEY, readPhone, subscribePhone, writePhone } from "../registry";

afterEach(() => {
  writePhone(null);
  window.localStorage.clear();
});

describe("phone registry", () => {
  it("remembers the number under the key the /phone page already uses", () => {
    writePhone("9876543210");
    expect(readPhone()).toBe("9876543210");
    expect(window.localStorage.getItem(PHONE_KEY)).toBe("9876543210");
  });

  it("forgets it when cleared", () => {
    writePhone("9876543210");
    writePhone(null);
    expect(readPhone()).toBeNull();
  });

  it("tells subscribers in the same tab when the number changes", () => {
    const listener = vi.fn();
    const off = subscribePhone(listener);
    writePhone("9876543210");
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    writePhone(null);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("keeps working for this tab when storage is unavailable", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    writePhone("9123456789");
    expect(readPhone()).toBe("9123456789");
    spy.mockRestore();
  });
});
