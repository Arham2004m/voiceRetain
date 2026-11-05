import { FREE_SHIPPING_THRESHOLD_PAISE, computeTotals, formatINR } from "@voiceretain/shared";
import type { ReactNode } from "react";

function Row({
  label,
  value,
  strong = false,
}: {
  label: ReactNode;
  value: ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className={strong ? "display text-2xl" : ""}>{label}</dt>
      <span
        aria-hidden
        className="border-ink/40 mb-1 min-w-4 flex-1 self-end border-b-2 border-dotted"
      />
      <dd className={`num ${strong ? "display text-3xl" : "font-semibold"}`}>{value}</dd>
    </div>
  );
}

export interface BillTotals {
  subtotalPaise: number;
  discountPaise: number;
  shippingPaise: number;
  totalPaise: number;
}

/** The bill: a receipt with dotted leaders and a torn bottom edge. */
export function Bill({
  totals,
  discountLabel,
  footnote,
  className = "",
}: {
  totals: BillTotals;
  discountLabel?: string;
  footnote?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`receipt-edge border-ink bg-paper border-t-8 px-5 pt-5 pb-8 ${className}`}>
      <dl className="flex flex-col gap-3">
        <Row label="Subtotal" value={formatINR(totals.subtotalPaise)} />
        {totals.discountPaise > 0 ? (
          <Row
            label={<span className="text-kumkum">{discountLabel ?? "Discount"}</span>}
            value={<span className="text-kumkum">−{formatINR(totals.discountPaise)}</span>}
          />
        ) : null}
        <Row
          label="Shipping"
          value={totals.shippingPaise === 0 ? "Free" : formatINR(totals.shippingPaise)}
        />
        <div role="group" aria-label="Total to pay" className="border-ink mt-1 border-t-2 pt-3">
          <Row label="Total" value={formatINR(totals.totalPaise)} strong />
        </div>
      </dl>
      {footnote ? <p className="text-ink-soft mt-4 text-sm">{footnote}</p> : null}
    </div>
  );
}

/** The bill for a cart, computed the same way the server does. */
export function CartSummary({
  subtotalPaise,
  percent = 0,
  code,
  className = "",
}: {
  subtotalPaise: number;
  percent?: number;
  code?: string;
  className?: string;
}) {
  const totals = computeTotals(subtotalPaise, percent);
  const toFree = FREE_SHIPPING_THRESHOLD_PAISE - subtotalPaise;

  return (
    <Bill
      totals={totals}
      className={className}
      discountLabel={`${percent}% off${code ? ` with ${code}` : ""}`}
      footnote={
        toFree > 0 && subtotalPaise > 0
          ? `Add ${formatINR(toFree)} more for free delivery.`
          : undefined
      }
    />
  );
}
