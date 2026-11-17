"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { formatINR } from "@voiceretain/shared";
import type { LiveCall } from "@/lib/dashboard/useDashboardSocket";
import { CallStatusBadge, OutcomeBadge } from "./Badges";
import { TranscriptChat } from "./TranscriptChat";

/** The call happening now (or the one that just finished), with its transcript as it grows. */
export function LiveCallPanel({ liveCall }: { liveCall?: LiveCall }) {
  const logRef = useRef<HTMLDivElement>(null);
  const turnCount = liveCall?.turns.length ?? 0;

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turnCount]);

  if (!liveCall) {
    return (
      <section className="bg-ink text-paper flex min-h-[26rem] flex-col justify-between p-6">
        <h2 className="display text-5xl">No live call</h2>
        <p className="text-paper/80 max-w-[26rem]">
          Calls appear here the moment they ring, and the conversation fills in as it happens.
        </p>
      </section>
    );
  }

  const { call, turns } = liveCall;
  const finished = call.status === "ENDED" || call.status === "MISSED";

  return (
    <section className="bg-ink text-paper flex min-h-[26rem] flex-col gap-4 p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="display text-5xl">{finished ? "Last call" : "Live call"}</h2>
          <p className="mt-2 text-lg font-semibold">{call.customerName}</p>
          <p className="num text-paper/80">{formatINR(call.cartTotalPaise)}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <CallStatusBadge status={call.status} />
          {finished ? <OutcomeBadge outcome={call.outcome} /> : null}
        </div>
      </header>

      <div
        ref={logRef}
        role="log"
        aria-live="polite"
        aria-label="Live transcript"
        className="min-h-0 flex-1 overflow-y-auto"
      >
        {turns.length === 0 ? (
          <p className="text-paper/80">
            {call.status === "RINGING"
              ? "Waiting for the call to be answered."
              : "Waiting for the first words…"}
          </p>
        ) : (
          <TranscriptChat turns={turns} />
        )}
      </div>

      <Link
        href={`/dashboard/calls/${call.id}`}
        className="text-marigold self-start font-semibold underline underline-offset-4"
      >
        Open call
      </Link>
    </section>
  );
}
