import { describe, expect, it } from "vitest";
import { resolveDiscountPercent } from "../vouchers/discount-policy";

const opts = { subtotalPaise: 149900, capPercent: 15, minCartPaise: 50000 };

describe("resolveDiscountPercent", () => {
  it.each([
    [10, 10],
    [12, 10],
    [15, 15],
    [16, 15],
    [40, 15],
    [100, 15],
    [3, 5],
    [1, 5],
    [7.9, 5],
    [5, 5],
    ["10", 10],
  ])("snaps a request of %j to %i percent", (requested, expected) => {
    expect(resolveDiscountPercent(requested, opts)).toEqual({ ok: true, percent: expected });
  });

  it.each([[0], [-5], ["abc"], [NaN], [Infinity], [null], [undefined], [{}], [""], [true]])(
    "refuses %j as INVALID_PERCENT",
    (requested) => {
      expect(resolveDiscountPercent(requested, opts)).toEqual({
        ok: false,
        reason: "INVALID_PERCENT",
      });
    },
  );

  it("never exceeds a lowered cap", () => {
    expect(resolveDiscountPercent(15, { ...opts, capPercent: 10 })).toEqual({
      ok: true,
      percent: 10,
    });
    expect(resolveDiscountPercent(100, { ...opts, capPercent: 5 })).toEqual({
      ok: true,
      percent: 5,
    });
  });

  it("refuses when the cap leaves no tier available", () => {
    expect(resolveDiscountPercent(10, { ...opts, capPercent: 3 })).toEqual({
      ok: false,
      reason: "INVALID_PERCENT",
    });
  });

  it("refuses carts below the minimum with CART_TOO_SMALL", () => {
    expect(resolveDiscountPercent(10, { ...opts, subtotalPaise: 49999 })).toEqual({
      ok: false,
      reason: "CART_TOO_SMALL",
    });
    expect(resolveDiscountPercent(10, { ...opts, subtotalPaise: 50000 })).toEqual({
      ok: true,
      percent: 10,
    });
  });
});
