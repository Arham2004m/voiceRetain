"use client";

import { useEffect, useState } from "react";
import type { VoucherCard } from "@voiceretain/shared";
import { formatPhone } from "@/lib/format";
import { VoucherCardView } from "./VoucherCardView";

const time = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
const day = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long" });

/** The lock screen: a clock, the number it answers for, and whatever the last call left behind. */
export function IdleScreen({
  phone,
  connected,
  missedNotice,
  voucher,
  error,
}: {
  phone: string;
  connected: boolean;
  missedNotice?: string;
  voucher?: VoucherCard;
  error?: string;
}) {
  // Read the clock after mounting so the server and browser renders agree.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex flex-1 flex-col px-6 pt-14 pb-6">
      <div className="min-h-[9.5rem]">
        {now ? (
          <>
            <p className="display num text-[6.4rem]">
              {time.format(now).replace(/\s?(am|pm)/i, "")}
            </p>
            <p className="text-paper/80 mt-1">{day.format(now)}</p>
          </>
        ) : null}
      </div>

      <div className="mt-6 flex flex-1 flex-col gap-4">
        {error ? (
          <p role="alert" className="bg-kumkum px-3.5 py-2.5 font-medium">
            {error}
          </p>
        ) : null}
        {missedNotice ? (
          <p className="bg-marigold text-ink px-3.5 py-2.5 font-semibold">{missedNotice}</p>
        ) : null}
        {voucher ? (
          <div>
            <p className="text-paper/80 mb-1 px-1 text-sm">Your last offer from ShopNest</p>
            <VoucherCardView voucher={voucher} />
          </div>
        ) : null}
      </div>

      <p className="text-paper/80 flex items-center gap-2 text-sm">
        <span
          aria-hidden
          className={`size-2.5 rounded-full ${connected ? "bg-leaf" : "bg-marigold"}`}
        />
        {connected
          ? `Waiting for calls on ${formatPhone(phone)}`
          : `Reconnecting… calls for ${formatPhone(phone)} will ring when it is back`}
      </p>
    </div>
  );
}
