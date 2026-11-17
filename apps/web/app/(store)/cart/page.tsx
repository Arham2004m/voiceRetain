"use client";

import { Spinner } from "@/components/ui/Spinner";
import { ButtonLink } from "@/components/ui/Button";
import { CartLine } from "@/components/store/CartLine";
import { CartSummary } from "@/components/store/CartSummary";
import { useCart } from "@/components/store/CartProvider";

export default function CartPage() {
  const { cart, ready, setQuantity, remove } = useCart();

  if (!ready) {
    return (
      <p className="flex items-center gap-3 py-16">
        <Spinner /> Loading your cart
      </p>
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <section className="py-16">
        <h1 className="display text-6xl sm:text-8xl">Your cart is empty.</h1>
        <p className="mt-4 mb-8 max-w-[28rem]">
          Nothing here yet. Pick something from the shelves and it will wait for you.
        </p>
        <ButtonLink href="/">Browse the shop</ButtonLink>
      </section>
    );
  }

  return (
    <section className="grid gap-10 py-10 lg:grid-cols-12 lg:py-14">
      <title>Your cart · ShopNest</title>
      <div className="lg:col-span-8">
        <h1 className="display text-6xl sm:text-8xl">Your cart</h1>
        <ul className="border-ink mt-8 border-t-2">
          {cart.items.map((item) => (
            <CartLine
              key={item.productId}
              item={item}
              onQuantity={(q) => setQuantity(item.productId, q)}
              onRemove={() => remove(item.productId)}
            />
          ))}
        </ul>
      </div>
      <aside className="lg:col-span-4">
        <div className="lg:sticky lg:top-24">
          <h2 className="display mb-3 text-3xl">Your bill</h2>
          <CartSummary subtotalPaise={cart.subtotalPaise} />
          <div className="mt-6 flex flex-col gap-3">
            <ButtonLink href="/checkout" className="w-full">
              Continue to checkout
            </ButtonLink>
            <ButtonLink href="/" variant="quiet" className="self-start">
              Keep shopping
            </ButtonLink>
          </div>
        </div>
      </aside>
    </section>
  );
}
