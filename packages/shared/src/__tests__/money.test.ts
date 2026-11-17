import { describe, expect, it } from "vitest";
import { formatINR, computeTotals } from "../index";

describe("formatINR", () => {
  it("formats whole rupees", () => expect(formatINR(149900)).toBe("₹1,499"));
  it("formats paise", () => expect(formatINR(149950)).toBe("₹1,499.50"));
  it("uses Indian grouping", () => expect(formatINR(10000000)).toBe("₹1,00,000"));
});

describe("computeTotals", () => {
  it("applies discount and shipping", () => {
    expect(computeTotals(149900, 10)).toEqual({
      subtotalPaise: 149900,
      discountPaise: 14990,
      shippingPaise: 9900,
      totalPaise: 144810,
    });
  });
  it("free shipping at or above threshold", () => {
    expect(computeTotals(250000, 0).shippingPaise).toBe(0);
    expect(computeTotals(200000, 0).shippingPaise).toBe(0);
    expect(computeTotals(199999, 0).shippingPaise).toBe(9900);
  });
  it("floors the discount", () => {
    expect(computeTotals(149900, 15).discountPaise).toBe(22485);
  });
});
