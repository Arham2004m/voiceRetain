"use client";

import { formatINR, type CartDTO } from "@voiceretain/shared";
import { toneFor } from "@/lib/product-art";

type Item = CartDTO["items"][number];

export function CartLine({
  item,
  onQuantity,
  onRemove,
}: {
  item: Item;
  onQuantity: (quantity: number) => void;
  onRemove: () => void;
}) {
  const tone = toneFor(item.productId);
  const step =
    "border-ink hover:bg-ink hover:text-paper flex size-11 cursor-pointer items-center justify-center border-2 text-xl font-semibold transition-colors disabled:pointer-events-none disabled:opacity-40";

  return (
    <li className="border-ink grid grid-cols-[5.5rem_1fr] gap-x-4 gap-y-3 border-b-2 py-5 sm:grid-cols-[6.5rem_1fr_auto]">
      <div className={`flex aspect-square items-center justify-center ${tone.tile}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.imageUrl} alt="" className="h-4/5 w-4/5 object-contain" />
      </div>

      <div className="flex flex-col justify-center">
        <h2 className="display text-3xl">{item.name}</h2>
        <p className="text-ink-soft num">{formatINR(item.unitPricePaise)} each</p>
      </div>

      <div className="col-span-2 flex items-center justify-between gap-4 sm:col-span-1 sm:flex-col sm:items-end sm:justify-center">
        <div
          className="flex items-center gap-1"
          role="group"
          aria-label={`Quantity of ${item.name}`}
        >
          <button
            type="button"
            className={step}
            aria-label={`Decrease quantity of ${item.name}`}
            onClick={() => onQuantity(item.quantity - 1)}
            disabled={item.quantity <= 1}
          >
            −
          </button>
          <span className="num w-9 text-center text-lg font-semibold" aria-live="polite">
            {item.quantity}
          </span>
          <button
            type="button"
            className={step}
            aria-label={`Increase quantity of ${item.name}`}
            onClick={() => onQuantity(item.quantity + 1)}
            disabled={item.quantity >= 10}
          >
            +
          </button>
        </div>
        <div className="flex items-baseline gap-4">
          <span className="display num text-3xl">
            {formatINR(item.quantity * item.unitPricePaise)}
          </span>
          <button
            type="button"
            onClick={onRemove}
            className="hover:text-kumkum cursor-pointer underline underline-offset-4"
            aria-label={`Remove ${item.name} from cart`}
          >
            Remove
          </button>
        </div>
      </div>
    </li>
  );
}
