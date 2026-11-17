"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ProductDTO } from "@voiceretain/shared";
import { api } from "@/lib/api";
import { categoryLabel, mixCategories } from "@/lib/product-art";
import { Button } from "@/components/ui/Button";
import { useCart } from "./CartProvider";
import { ProductTile } from "./ProductTile";

const PAGE_SIZE = 12;
const SKELETON_SPANS = [
  "lg:col-span-7",
  "lg:col-span-5",
  "lg:col-span-4",
  "lg:col-span-3",
  "lg:col-span-5",
  "lg:col-span-5",
  "lg:col-span-7",
];

const chip =
  "border-ink min-h-9 cursor-pointer border-2 px-3 text-sm font-semibold transition-colors aria-pressed:bg-ink aria-pressed:text-paper hover:bg-marigold hover:text-ink aria-pressed:hover:bg-ink aria-pressed:hover:text-paper";

export function ProductWall() {
  const { cart, add } = useCart();
  const [products, setProducts] = useState<ProductDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<string>("all");
  const [visible, setVisible] = useState(PAGE_SIZE);

  const load = useCallback(() => {
    setError(null);
    api
      .getProducts()
      .then(setProducts)
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(load, [load]);

  const categories = useMemo(() => {
    const slugs = [...new Set((products ?? []).map((p) => p.category))];
    return slugs.sort((a, b) => categoryLabel(a).localeCompare(categoryLabel(b)));
  }, [products]);

  const shelf = useMemo(() => {
    if (!products) return [];
    return category === "all"
      ? mixCategories(products)
      : products.filter((p) => p.category === category);
  }, [products, category]);

  const choose = (next: string) => {
    setCategory(next);
    setVisible(PAGE_SIZE);
  };

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
            className={`bg-ink/10 min-h-[31rem] animate-pulse motion-reduce:animate-none ${span}`}
          />
        ))}
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <p className="py-10 text-lg">
        There are no products on the shelves right now. Please check back soon.
      </p>
    );
  }

  const shown = shelf.slice(0, visible);
  const remaining = shelf.length - shown.length;
  const qtyOf = (id: string) => cart?.items.find((i) => i.productId === id)?.quantity ?? 0;

  return (
    <div>
      <div role="group" aria-label="Filter by category" className="mb-6 flex flex-wrap gap-2">
        <button
          type="button"
          className={chip}
          aria-pressed={category === "all"}
          onClick={() => choose("all")}
        >
          All
        </button>
        {categories.map((slug) => (
          <button
            key={slug}
            type="button"
            className={chip}
            aria-pressed={category === slug}
            onClick={() => choose(slug)}
          >
            {categoryLabel(slug)}
          </button>
        ))}
      </div>

      <div className="grid gap-0 sm:grid-cols-2 lg:grid-cols-12">
        {shown.map((p, i) => (
          <ProductTile
            key={p.id}
            product={p}
            index={i}
            inCart={qtyOf(p.id)}
            onAdd={() => add(p)}
            priority={i < 2}
          />
        ))}
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-3">
        {remaining > 0 ? (
          <Button onClick={() => setVisible((n) => n + PAGE_SIZE)}>
            {`Show ${Math.min(PAGE_SIZE, remaining)} more`}
          </Button>
        ) : null}
        <p aria-live="polite" className="text-ink-soft">
          {`Showing ${shown.length} of ${shelf.length}`}
        </p>
      </div>
    </div>
  );
}
