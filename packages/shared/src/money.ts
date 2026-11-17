import { FREE_SHIPPING_THRESHOLD_PAISE, SHIPPING_FEE_PAISE } from "./constants";

export function formatINR(paise: number): string {
  const rupees = paise / 100;
  const whole = paise % 100 === 0;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(rupees);
}

export interface Totals {
  subtotalPaise: number;
  discountPaise: number;
  shippingPaise: number;
  totalPaise: number;
}

export function computeTotals(subtotalPaise: number, percent: number): Totals {
  const discountPaise = Math.floor((subtotalPaise * percent) / 100);
  const shippingPaise = subtotalPaise >= FREE_SHIPPING_THRESHOLD_PAISE ? 0 : SHIPPING_FEE_PAISE;
  return {
    subtotalPaise,
    discountPaise,
    shippingPaise,
    totalPaise: subtotalPaise - discountPaise + shippingPaise,
  };
}
