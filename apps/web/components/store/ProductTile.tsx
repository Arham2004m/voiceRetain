"use client";

import { formatINR, type ProductDTO } from "@voiceretain/shared";
import { spanFor, toneFor } from "@/lib/product-art";
import { Button } from "@/components/ui/Button";

/** The price, on a tag that hangs from a red thread and swings when you reach for the tile. */
function PriceTag({ pricePaise }: { pricePaise: number }) {
  return (
    <div
      className="group-hover:animate-swing group-focus-within:animate-swing absolute top-0 right-6 z-10 origin-top"
      style={{ rotate: "5deg" }}
    >
      <div className="bg-kumkum ml-[1.38rem] h-9 w-0.5" aria-hidden />
      <div className="bg-paper text-ink relative w-max min-w-[7.75rem] [clip-path:polygon(0_16px,16px_0,100%_0,100%_100%,0_100%)] pt-5 pr-4 pb-3 pl-4">
        <span
          aria-hidden
          className="bg-chalk border-kumkum absolute top-1.5 left-[1.05rem] size-2.5 rounded-full border-2"
        />
        <span className="display num block text-[2rem] whitespace-nowrap">
          {formatINR(pricePaise)}
        </span>
      </div>
    </div>
  );
}

export function ProductTile({
  product,
  index,
  inCart,
  onAdd,
  priority = false,
}: {
  product: ProductDTO;
  /** Position on the wall; sets how wide the tile is on large screens. */
  index: number;
  inCart: number;
  onAdd: () => void;
  priority?: boolean;
}) {
  const tone = toneFor(product.id);

  return (
    <article
      className={`group relative flex min-h-[31rem] flex-col overflow-hidden p-6 ${tone.tile} ${spanFor(index)}`}
    >
      <PriceTag pricePaise={product.pricePaise} />

      {/* The art keeps clear of the tag on the right and of the text below. */}
      <div className="mt-28 min-h-[11rem] flex-1 sm:mt-12 sm:mr-[8.5rem]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={product.imageUrl}
          alt=""
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          className="pointer-events-none h-full w-full origin-bottom-left object-contain object-left transition-transform duration-300 group-hover:scale-[1.04] motion-reduce:transition-none"
        />
      </div>

      <div className="relative z-10 mt-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="max-w-[26rem]">
          <h2 className="display line-clamp-3 text-[2.1rem] sm:text-[2.7rem]">{product.name}</h2>
          <p className="mt-2 line-clamp-2 text-[0.95rem] opacity-90">{product.description}</p>
        </div>
        <div className="flex flex-col items-start gap-2">
          <Button variant={tone.dark ? "primary" : "ink"} onClick={onAdd}>
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
