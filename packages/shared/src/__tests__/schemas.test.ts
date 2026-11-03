import { describe, expect, it } from "vitest";
import {
  CheckoutInput,
  CreateCartInput,
  DemoConfigInput,
  SearchQuery,
  CartAbandonedWebhookInput,
} from "../index";

describe("CheckoutInput", () => {
  it("trims name and normalizes phone", () => {
    const out = CheckoutInput.parse({
      name: " Rohan ",
      phone: "+91 98765 43210",
      consentToCall: true,
    });
    expect(out.name).toBe("Rohan");
    expect(out.phone).toBe("9876543210");
  });
  it("rejects invalid mobile prefix", () => {
    expect(
      CheckoutInput.safeParse({ name: "Rohan", phone: "5876543210", consentToCall: true }).success,
    ).toBe(false);
  });
  it("rejects short names", () => {
    expect(
      CheckoutInput.safeParse({ name: "R", phone: "9876543210", consentToCall: true }).success,
    ).toBe(false);
  });
});

describe("CreateCartInput", () => {
  const item = (quantity: number) => ({ items: [{ productId: "p1", quantity }] });
  it("accepts quantity 1..10", () => {
    expect(CreateCartInput.safeParse(item(1)).success).toBe(true);
    expect(CreateCartInput.safeParse(item(10)).success).toBe(true);
  });
  it("rejects quantity 0 and 11", () => {
    expect(CreateCartInput.safeParse(item(0)).success).toBe(false);
    expect(CreateCartInput.safeParse(item(11)).success).toBe(false);
  });
  it("rejects empty items", () => {
    expect(CreateCartInput.safeParse({ items: [] }).success).toBe(false);
  });
});

describe("other schemas", () => {
  it("DemoConfigInput bounds the delay", () => {
    expect(DemoConfigInput.safeParse({ abandonDelayMs: 1000 }).success).toBe(false);
    expect(DemoConfigInput.safeParse({ abandonDelayMs: 30000 }).success).toBe(true);
  });
  it("SearchQuery trims and requires 2-50 chars", () => {
    expect(SearchQuery.safeParse({ q: " a " }).success).toBe(false);
    expect(SearchQuery.parse({ q: " rohan " }).q).toBe("rohan");
  });
  it("webhook input requires customer and items", () => {
    expect(
      CartAbandonedWebhookInput.safeParse({
        customer: { name: "Rohan", phone: "9876543210", consentToCall: true },
        items: [{ productId: "p1", quantity: 1 }],
      }).success,
    ).toBe(true);
  });
});
