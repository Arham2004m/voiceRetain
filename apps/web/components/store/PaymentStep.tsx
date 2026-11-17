"use client";

import type { CartDTO } from "@voiceretain/shared";
import { Button, ButtonLink } from "@/components/ui/Button";
import { CartSummary } from "./CartSummary";
import { VoucherInput, type AppliedVoucher } from "./VoucherInput";

export function PaymentStep({
  cart,
  applied,
  initialCode,
  onApplied,
  onPlaceOrder,
  onEditDetails,
  placing,
  error,
}: {
  cart: CartDTO;
  applied: AppliedVoucher | null;
  initialCode?: string;
  onApplied: (voucher: AppliedVoucher | null) => void;
  onPlaceOrder: () => void;
  onEditDetails: () => void;
  placing: boolean;
  error: string | null;
}) {
  return (
    <div className="grid gap-10 lg:grid-cols-12">
      <div className="flex max-w-[34rem] flex-col gap-8 lg:col-span-7">
        {cart.customer ? (
          <p>
            Order for <strong>{cart.customer.name}</strong>, mobile {cart.customer.phone}.{" "}
            <button
              type="button"
              onClick={onEditDetails}
              className="hover:text-peacock cursor-pointer underline underline-offset-4"
            >
              Change details
            </button>
          </p>
        ) : null}

        <VoucherInput cartId={cart.id} initialCode={initialCode} onApplied={onApplied} />

        <p className="text-ink-soft">
          This is a demo store, so no payment is taken when you place the order.
        </p>

        {error ? (
          <p role="alert" className="text-kumkum font-medium">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <Button onClick={onPlaceOrder} loading={placing}>
            Place order
          </Button>
          <ButtonLink href="/left" variant="quiet">
            Leave store
          </ButtonLink>
        </div>
      </div>

      <aside className="lg:col-span-5">
        <h2 className="display mb-3 text-3xl">Your bill</h2>
        <CartSummary
          subtotalPaise={cart.subtotalPaise}
          percent={applied?.percent ?? 0}
          code={applied?.code}
        />
      </aside>
    </div>
  );
}
