"use client";

import type { VoucherCard } from "@voiceretain/shared";
import { formatClock } from "./InCallScreen";
import { VoucherCardView } from "./VoucherCardView";

export function EndedScreen({
  durationSec,
  voucher,
  onDone,
}: {
  durationSec: number;
  voucher?: VoucherCard;
  onDone: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col px-6 pt-14 pb-6">
      <h2 className="display text-7xl">Call ended</h2>
      <p className="num text-paper/80 mt-2">{`Call lasted ${formatClock(durationSec)}`}</p>

      <div className="mt-6 flex-1">{voucher ? <VoucherCardView voucher={voucher} /> : null}</div>

      <div className="flex items-center justify-between gap-4">
        <p className="text-paper/70 text-sm">Back to the lock screen in a few seconds.</p>
        <button
          type="button"
          onClick={onDone}
          className="bg-marigold text-ink hover:bg-paper min-h-11 cursor-pointer px-5 font-semibold transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  );
}
