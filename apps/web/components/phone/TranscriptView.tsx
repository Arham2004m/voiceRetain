"use client";

import { useEffect, useRef } from "react";
import type { TranscriptLine } from "@/lib/phone/usePhoneCall";

/** The conversation so far. A live region, so a screen reader hears each new line. */
export function TranscriptView({
  lines,
  interim,
}: {
  lines: TranscriptLine[];
  /** What the customer is saying right now, before it is final. */
  interim?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines.length, interim]);

  return (
    <div
      ref={ref}
      role="log"
      aria-live="polite"
      aria-label="Call transcript"
      className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-4 py-3"
    >
      {lines.map((line) => (
        <p
          key={line.id}
          className={`max-w-[85%] px-3.5 py-2.5 text-[1.02rem] leading-snug text-ink ${
            line.speaker === "AGENT" ? "bg-paper self-start" : "bg-marigold self-end"
          }`}
        >
          {line.text}
        </p>
      ))}
      {interim ? (
        <p className="border-marigold text-marigold max-w-[85%] self-end border-2 border-dashed px-3.5 py-2.5 italic">
          {interim}
        </p>
      ) : null}
    </div>
  );
}
