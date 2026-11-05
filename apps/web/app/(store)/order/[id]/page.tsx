"use client";

import { use, useEffect, useState } from "react";
import type { OrderDTO } from "@voiceretain/shared";
import { api } from "@/lib/api";
import { ButtonLink } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { Bill } from "@/components/store/CartSummary";

export default function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [order, setOrder] = useState<OrderDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getOrder(id)
      .then(setOrder)
      .catch((err: Error) => setError(err.message));
  }, [id]);

  if (error) {
    return (
      <section className="py-16">
        <h1 className="display text-6xl sm:text-8xl">We couldn&rsquo;t find that order.</h1>
        <p className="mt-4 mb-8">{error}</p>
        <ButtonLink href="/">Back to the shop</ButtonLink>
      </section>
    );
  }

  if (!order) {
    return (
      <p className="flex items-center gap-3 py-16">
        <Spinner /> Loading your order
      </p>
    );
  }

  return (
    <section className="grid gap-10 py-10 lg:grid-cols-12 lg:py-16">
      <title>Order placed · ShopNest</title>
      <div className="lg:col-span-7">
        <h1 className="display text-6xl sm:text-8xl lg:text-9xl">Order placed.</h1>
        <p className="mt-6 max-w-[32rem] text-lg">
          Thank you. Your order number is{" "}
          <strong className="num">#{order.id.slice(-8).toUpperCase()}</strong>. This is a demo
          store, so nothing was charged and nothing will ship.
        </p>
        <div className="mt-10">
          <ButtonLink href="/">Keep shopping</ButtonLink>
        </div>
      </div>
      <aside className="lg:col-span-5">
        <h2 className="display mb-3 text-3xl">Your bill</h2>
        <Bill totals={order} discountLabel="Discount" discountNote={order.voucherCode} />
      </aside>
    </section>
  );
}
