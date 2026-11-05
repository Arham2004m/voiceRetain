"use client";

import { formatINR, type IncomingCallPayload } from "@voiceretain/shared";

function Handset({ down = false }: { down?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={`size-8 fill-current ${down ? "rotate-[135deg]" : ""}`}
    >
      <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z" />
    </svg>
  );
}

export function RingingScreen({
  incoming,
  soundBlocked,
  onAnswer,
  onDecline,
  onEnableSound,
}: {
  incoming: IncomingCallPayload;
  soundBlocked: boolean;
  onAnswer: () => void;
  onDecline: () => void;
  onEnableSound: () => void;
}) {
  const round =
    "flex size-[4.75rem] cursor-pointer items-center justify-center rounded-full text-paper transition-transform hover:scale-105 motion-reduce:transition-none";

  return (
    <div className="bg-marigold text-ink flex flex-1 flex-col px-6 pt-14 pb-10">
      <p className="font-semibold">Incoming call</p>
      <div className="mt-6 flex-1">
        <h2 className="display text-[5.6rem]">ShopNest</h2>
        <p className="mt-3 text-xl">{`${incoming.customerName}'s order ${formatINR(incoming.subtotalPaise)}`}</p>
        {soundBlocked ? (
          <button
            type="button"
            onClick={onEnableSound}
            className="mt-6 cursor-pointer text-base font-semibold underline underline-offset-4"
          >
            Tap to enable sound
          </button>
        ) : null}
      </div>
      <div className="flex items-end justify-between px-3">
        <button
          type="button"
          onClick={onDecline}
          className="flex cursor-pointer flex-col items-center gap-2 font-semibold"
          aria-label="Decline"
        >
          <span className={`${round} bg-kumkum`}>
            <Handset down />
          </span>
          Decline
        </button>
        <button
          type="button"
          onClick={onAnswer}
          className="flex cursor-pointer flex-col items-center gap-2 font-semibold"
          aria-label="Answer"
        >
          <span className={`${round} bg-leaf`}>
            <Handset />
          </span>
          Answer
        </button>
      </div>
    </div>
  );
}
