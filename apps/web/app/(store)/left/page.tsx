import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/Button";

export const metadata: Metadata = { title: "Cart saved" };

export default function LeftPage() {
  return (
    <section className="py-16 lg:py-24">
      <h1 className="display text-6xl sm:text-8xl lg:text-9xl">You left ShopNest.</h1>
      <p className="mt-6 max-w-[34rem] text-lg">
        Your cart is saved, so nothing is lost. If you ticked the call box at checkout, someone from
        ShopNest may phone shortly to help you finish your order.
      </p>
      <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-3">
        <ButtonLink href="/cart">Back to your cart</ButtonLink>
        <ButtonLink href="/" variant="quiet">
          Keep shopping
        </ButtonLink>
      </div>
    </section>
  );
}
