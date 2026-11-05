"use client";

import { useCallback, useEffect, useState } from "react";
import type { ProductDTO } from "@voiceretain/shared";
import { api } from "@/lib/api";
import { shelfPosition } from "@/lib/product-art";
import { Button } from "@/components/ui/Button";
import { useCart } from "./CartProvider";
import { ProductTile } from "./ProductTile";

const SKELETON_SPANS = [
  "lg:col-span-7",
  "lg:col-span-5",
  "lg:col-span-4",
  "lg:col-span-3",
  "lg:col-span-5",
  "lg:col-span-7",
];

function DeliveryTile() {
  return (
    <aside className="bg-ink text-paper flex min-h-[25rem] flex-col justify-between p-6 lg:col-span-5">
      <p className="display text-[3.4rem] sm:text-7xl">
        Free delivery
        <br />
        from ₹2,000.
      </p>
      <div className="flex max-w-[30rem] flex-col gap-3">
        <p>Under that, delivery is ₹99. Orders ship from Pune and usually arrive in 3 to 5 days.</p>
        <p className="text-paper/80 text-sm">
          If you leave checkout after ticking the call box, one of our team may phone to help you
          finish. Leave it unticked and we won&rsquo;t.
        </p>
      </div>
    </aside>
  );
}

export function ProductWall() {
  const { cart, add } = useCart();
  const [products, setProducts] = useState<ProductDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    api
      .getProducts()
      .then((list) =>
        setProducts([...list].sort((a, b) => shelfPosition(a.slug) - shelfPosition(b.slug))),
      )
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(load, [load]);

  if (error) {
    return (
      <div role="alert" className="border-kumkum border-2 p-6">
        <p className="display text-3xl">The shelves didn&rsquo;t load.</p>
        <p className="mt-2 mb-4">{error}</p>
        <Button onClick={load}>Try again</Button>
      </div>
    );
  }

  if (!products) {
    return (
      <div
        aria-busy
        className="grid gap-0 lg:grid-cols-12"
        role="status"
        aria-label="Loading products"
      >
        {SKELETON_SPANS.map((span, i) => (
          <div
            key={i}
            className={`bg-ink/10 min-h-[25rem] animate-pulse motion-reduce:animate-none ${span}`}
          />
        ))}
      </div>
    );
  }

  const qtyOf = (id: string) => cart?.items.find((i) => i.productId === id)?.quantity ?? 0;

  return (
    <div className="grid gap-0 sm:grid-cols-2 lg:grid-cols-12">
      {products.map((p, i) => (
        <ProductTile
          key={p.id}
          product={p}
          inCart={qtyOf(p.id)}
          onAdd={() => add(p)}
          priority={i < 2}
        />
      ))}
      <DeliveryTile />
    </div>
  );
}
