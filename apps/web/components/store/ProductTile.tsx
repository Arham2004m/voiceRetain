"use client";

import { formatINR, type ProductDTO } from "@voiceretain/shared";
import { artFor } from "@/lib/product-art";
import { Button } from "@/components/ui/Button";

/** The price, on a tag that hangs from a red thread and swings when you reach for the tile. */
function PriceTag({ pricePaise }: { pricePaise: number }) {
  return (
    <div
      className="group-hover:animate-swing group-focus-within:animate-swing absolute top-0 right-6 z-10 origin-top"
      style={{ rotate: "5deg" }}
    >
      <div className="bg-kumkum ml-[1.38rem] h-9 w-0.5" aria-hidden />
      <div className="bg-paper text-ink relative w-[7.75rem] [clip-path:polygon(0_16px,16px_0,100%_0,100%_100%,0_100%)] pt-5 pr-3 pb-3 pl-4">
        <span
          aria-hidden
          className="bg-chalk border-kumkum absolute top-1.5 left-[1.05rem] size-2.5 rounded-full border-2"
        />
        <span className="display num block text-[2rem]">{formatINR(pricePaise)}</span>
      </div>
    </div>
  );
}

export function ProductTile({
  product,
  inCart,
  onAdd,
  priority = false,
}: {
  product: ProductDTO;
  inCart: number;
  onAdd: () => void;
  priority?: boolean;
}) {
  const art = artFor(product.slug);

  return (
    <article
      className={`group relative flex min-h-[25rem] flex-col justify-end overflow-hidden p-6 ${art.tile} ${art.span}`}
    >
      <PriceTag pricePaise={product.pricePaise} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={product.imageUrl}
        alt=""
        loading={priority ? "eager" : "lazy"}
        className="pointer-events-none absolute top-12 left-1/2 h-[58%] w-auto max-w-[78%] -translate-x-1/2 object-contain transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none"
      />
      <div className="relative z-10 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="max-w-[26rem]">
          <h2 className="display text-[2.6rem] sm:text-5xl">{product.name}</h2>
          <p className="mt-2 text-[0.95rem] opacity-90">{product.description}</p>
        </div>
        <div className="flex flex-col items-start gap-2">
          <Button variant={art.dark ? "primary" : "ink"} onClick={onAdd}>
            Add to cart
          </Button>
          <p aria-live="polite" className="min-h-5 text-sm font-semibold">
            {inCart > 0 ? `${inCart} in your cart` : ""}
          </p>
        </div>
      </div>
    </article>
  );
}
