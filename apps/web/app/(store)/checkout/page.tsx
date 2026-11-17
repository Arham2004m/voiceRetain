"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ApiClientError, api } from "@/lib/api";
import { writePhone } from "@/lib/phone/registry";
import { ButtonLink } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { CartSummary } from "@/components/store/CartSummary";
import { useCart } from "@/components/store/CartProvider";
import { CheckoutForm, type CheckoutValues } from "@/components/store/CheckoutForm";
import { PaymentStep } from "@/components/store/PaymentStep";
import type { AppliedVoucher } from "@/components/store/VoucherInput";

function Loading({ children }: { children: string }) {
  return (
    <p className="flex items-center gap-3 py-16">
      <Spinner /> {children}
    </p>
  );
}

function CheckoutFlow() {
  const router = useRouter();
  const toast = useToast();
  const params = useSearchParams();
  const linkCart = params.get("cart");
  const linkCode = params.get("code")?.trim().toUpperCase() || undefined;

  const { cart, ready, adopt, replace, clear } = useCart();
  const [step, setStep] = useState<"details" | "payment">("details");
  const [applied, setApplied] = useState<AppliedVoucher | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [placed, setPlaced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkHandled, setLinkHandled] = useState(!linkCart);
  const started = useRef(false);

  // Arriving from the phone's "Complete my order" link: restore that cart and, if the shopper
  // already gave their details, go straight to payment with the code waiting to be applied.
  useEffect(() => {
    if (!ready || !linkCart || started.current) return;
    started.current = true;
    const finish = (loaded: typeof cart) => {
      if (loaded?.customer) setStep("payment");
      setLinkHandled(true);
    };
    if (cart?.id === linkCart) finish(cart);
    else void adopt(linkCart).then(finish);
  }, [ready, linkCart, cart, adopt]);

  if (placed) return <Loading>Order placed. Opening your bill</Loading>;
  if (!ready || !linkHandled) return <Loading>Getting your order ready</Loading>;

  if (!cart || cart.items.length === 0) {
    return (
      <section className="py-16">
        <h1 className="display text-6xl sm:text-8xl">Nothing to check out.</h1>
        <p className="mt-4 mb-8 max-w-[28rem]">Your cart is empty. Add something first.</p>
        <ButtonLink href="/">Browse the shop</ButtonLink>
      </section>
    );
  }

  if (cart.status === "COMPLETED" || cart.status === "RECOVERED") {
    return (
      <section className="py-16">
        <h1 className="display text-6xl sm:text-8xl">Already ordered.</h1>
        <p className="mt-4 mb-8 max-w-[28rem]">
          This cart has been paid for. Start a new one below.
        </p>
        <ButtonLink href="/">Back to the shop</ButtonLink>
      </section>
    );
  }

  const savingElsewhere = cart.id === "pending";

  const submitDetails = async (values: CheckoutValues) => {
    if (savingElsewhere) {
      toast.push("Still saving your cart. Try again in a moment.");
      return;
    }
    setSubmitting(true);
    try {
      replace(await api.checkout(cart.id, values));
      writePhone(values.phone); // the number that gets the call: no separate phone to register
      setStep("payment");
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Could not save your details.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const placeOrder = async () => {
    setPlacing(true);
    setError(null);
    try {
      const order = await api.completeOrder(cart.id, applied?.code);
      setPlaced(true); // keep this page from flashing "empty cart" while the bill loads
      clear();
      router.push(`/order/${order.id}`);
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 409) {
        clear();
        toast.push("This cart was already ordered.", "error");
        router.push("/");
        return;
      }
      setError(err instanceof Error ? err.message : "Could not place the order. Try again.");
      setPlacing(false);
    }
  };

  return (
    <section className="py-10 lg:py-14">
      <title>Checkout · ShopNest</title>
      <h1 className="display mb-8 text-6xl sm:text-8xl">
        {step === "details" ? "Your details" : "Payment"}
      </h1>

      {step === "details" ? (
        <div className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <CheckoutForm
              onSubmit={submitDetails}
              submitting={submitting}
              initial={
                cart.customer ? { name: cart.customer.name, phone: cart.customer.phone } : undefined
              }
            />
          </div>
          <aside className="lg:col-span-5">
            <h2 className="display mb-3 text-3xl">Your bill</h2>
            <CartSummary subtotalPaise={cart.subtotalPaise} />
          </aside>
        </div>
      ) : (
        <PaymentStep
          cart={cart}
          applied={applied}
          initialCode={linkCode}
          onApplied={setApplied}
          onPlaceOrder={placeOrder}
          onEditDetails={() => setStep("details")}
          placing={placing}
          error={error}
        />
      )}
    </section>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<Loading>Getting your order ready</Loading>}>
      <CheckoutFlow />
    </Suspense>
  );
}
