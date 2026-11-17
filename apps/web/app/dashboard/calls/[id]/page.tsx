"use client";

import Link from "next/link";
import { use } from "react";
import { formatINR } from "@voiceretain/shared";
import { Bill } from "@/components/store/CartSummary";
import {
  CallStatusBadge,
  OutcomeBadge,
  SentimentBadge,
  VoucherStatusBadge,
} from "@/components/dashboard/Badges";
import { TranscriptChat } from "@/components/dashboard/TranscriptChat";
import { effectiveVoucherStatus, endReasonLabel, objectionLabel } from "@/lib/dashboard/labels";
import { useCallDetail } from "@/lib/dashboard/useCallDetail";
import { formatDuration, formatLatency, formatPhone, formatWhen } from "@/lib/format";

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-ink-soft text-sm">{label}</dt>
      <dd className="font-semibold">{children}</dd>
    </div>
  );
}

export default function CallDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { call, loading, error, notFound } = useCallDetail(id);

  const back = (
    <Link href="/dashboard/calls" className="font-semibold underline underline-offset-4">
      All calls
    </Link>
  );

  if (notFound) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="display text-6xl">That call does not exist.</h1>
        {back}
      </div>
    );
  }
  if (error && !call) {
    return (
      <div className="flex flex-col gap-4">
        <p role="alert" className="text-kumkum font-medium">
          {error}
        </p>
        {back}
      </div>
    );
  }
  if (!call) return <p aria-busy={loading}>Loading the call…</p>;

  const live = call.status === "RINGING" || call.status === "IN_PROGRESS";

  return (
    <div className="flex flex-col gap-8">
      <title>{`${call.customerName} · Merchant desk`}</title>
      <div>
        {back}
        <h1 className="display mt-3 text-6xl sm:text-8xl">{call.customerName}</h1>
        <p className="num text-ink-soft mt-1 text-lg">{formatPhone(call.customerPhone)}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <CallStatusBadge status={call.status} />
          <OutcomeBadge outcome={call.outcome} />
          <SentimentBadge sentiment={call.sentiment} />
        </div>
      </div>

      {call.summary ? <p className="max-w-[40rem] text-xl">{call.summary}</p> : null}

      <dl className="border-ink grid grid-cols-2 gap-x-6 gap-y-4 border-y-2 py-5 sm:grid-cols-3 lg:grid-cols-6">
        <Fact label="Cart">{formatINR(call.cartTotalPaise)}</Fact>
        <Fact label="Started">{formatWhen(call.startedAt)}</Fact>
        <Fact label="Length">{formatDuration(call.durationSec)}</Fact>
        <Fact label="Average reply time">{formatLatency(call.avgLatencyMs)}</Fact>
        <Fact label="Main objection">{objectionLabel(call.objection)}</Fact>
        <Fact label="How it ended">{endReasonLabel(call.endReason)}</Fact>
      </dl>

      <div className="grid gap-8 lg:grid-cols-12">
        <section className="lg:col-span-7" aria-label="Conversation">
          <h2 className="display mb-3 text-3xl">Conversation{live ? " (happening now)" : ""}</h2>
          <div role="log" aria-live={live ? "polite" : "off"} aria-label="Call transcript">
            <TranscriptChat turns={call.turns} showLatency />
          </div>
        </section>

        <div className="flex flex-col gap-8 lg:col-span-5">
          <section>
            <h2 className="display mb-3 text-3xl">Discount codes</h2>
            {call.vouchers.length === 0 ? (
              <p className="text-ink-soft">No code was offered on this call.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {call.vouchers.map((v) => (
                  <li
                    key={v.id}
                    className="border-ink bg-paper flex flex-wrap items-center justify-between gap-3 border-2 p-3"
                  >
                    <div>
                      <p className="font-mono text-lg font-bold tracking-wide">{v.code}</p>
                      <p className="text-ink-soft text-sm">
                        {v.percent}% off, valid until {formatWhen(v.expiresAt)}
                      </p>
                    </div>
                    <VoucherStatusBadge status={effectiveVoucherStatus(v)} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="display mb-3 text-3xl">Order</h2>
            {call.order ? (
              <Bill
                totals={call.order}
                discountLabel="Discount"
                discountNote={call.order.voucherCode}
              />
            ) : (
              <p className="text-ink-soft">No order has been placed for this cart.</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
