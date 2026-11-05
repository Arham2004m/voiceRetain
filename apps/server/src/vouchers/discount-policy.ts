import { DISCOUNT_TIERS, HARD_MAX_DISCOUNT } from "@voiceretain/shared";

export type DiscountDecision =
  { ok: true; percent: 5 | 10 | 15 } | { ok: false; reason: "INVALID_PERCENT" | "CART_TOO_SMALL" };

export interface DiscountOptions {
  subtotalPaise: number;
  capPercent: number;
  minCartPaise: number;
}

function toNumber(requested: unknown): number {
  if (typeof requested === "number") return requested;
  if (typeof requested === "string" && requested.trim() !== "") return Number(requested);
  return NaN;
}

/**
 * The only place that decides how much discount a request is worth. Whatever the customer or
 * the model asks for is snapped down to an allowed tier no higher than the cap (never above
 * 15); requests of 1–4 percent round up to the lowest tier.
 */
export function resolveDiscountPercent(
  requested: unknown,
  opts: DiscountOptions,
): DiscountDecision {
  const value = toNumber(requested);
  if (!Number.isFinite(value) || value <= 0) return { ok: false, reason: "INVALID_PERCENT" };

  const cap = Math.min(opts.capPercent, HARD_MAX_DISCOUNT);
  const allowed = DISCOUNT_TIERS.filter((tier) => tier <= cap);
  const lowest = allowed[0];
  if (lowest === undefined) return { ok: false, reason: "INVALID_PERCENT" };

  if (opts.subtotalPaise < opts.minCartPaise) return { ok: false, reason: "CART_TOO_SMALL" };

  const atOrBelow = allowed.filter((tier) => tier <= value);
  const percent = atOrBelow[atOrBelow.length - 1] ?? lowest;
  return { ok: true, percent };
}
