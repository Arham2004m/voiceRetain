"use client";

import { useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { EndedScreen } from "@/components/phone/EndedScreen";
import { InCallScreen } from "@/components/phone/InCallScreen";
import { PhoneFrame } from "@/components/phone/PhoneFrame";
import { RingingScreen } from "@/components/phone/RingingScreen";
import { usePhoneCall } from "@/lib/phone/usePhoneCall";
import { useRegisteredPhone } from "@/lib/phone/registry";

/**
 * The phone, built into the store. The number typed at checkout is the one that rings, so there
 * is nothing to register and no second window. The call appears over whichever store page the
 * shopper is on, and goes away when it is over.
 */
export function StoreCallOverlay() {
  const phone = useRegisteredPhone();
  const call = usePhoneCall(phone);
  const reduce = useReducedMotion();
  const { state } = call;

  const ringing = state === "ringing" && Boolean(call.incoming);
  const inCall =
    state === "connecting" || state === "listening" || state === "thinking" || state === "speaking";
  const ended = state === "ended";
  const open = ringing || inCall || ended;

  // A ringing call must be noticed even if the shopper has switched to another tab.
  useEffect(() => {
    if (!ringing) return;
    const original = document.title;
    let on = true;
    document.title = "📞 ShopNest is calling…";
    const timer = setInterval(() => {
      on = !on;
      document.title = on ? "📞 ShopNest is calling…" : original;
    }, 1000);
    return () => {
      clearInterval(timer);
      document.title = original;
    };
  }, [ringing]);

  return (
    <>
      {!open && call.missedNotice ? (
        <p
          role="status"
          className="bg-ink text-paper fixed right-4 bottom-4 z-50 max-w-[20rem] px-4 py-3 font-semibold"
        >
          {call.missedNotice}
        </p>
      ) : null}

      <AnimatePresence>
        {open ? (
          <motion.div
            key="call"
            role="dialog"
            aria-label="Call from ShopNest"
            initial={reduce ? false : { opacity: 0, y: 48 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 48 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="fixed right-3 bottom-3 z-50 w-[min(24rem,calc(100vw-1.5rem))]"
          >
            <PhoneFrame ringing={ringing}>
              {ringing && call.incoming ? (
                <RingingScreen
                  incoming={call.incoming}
                  soundBlocked={call.soundBlocked}
                  onAnswer={call.answer}
                  onDecline={call.decline}
                  onEnableSound={call.enableSound}
                />
              ) : inCall ? (
                <InCallScreen
                  state={state}
                  transcript={call.transcript}
                  voucher={call.voucher}
                  answeredAt={call.answeredAt}
                  muted={call.muted}
                  hangingUp={call.hangingUp}
                  connected={call.connected}
                  recognition={call.recognition}
                  onSend={call.sendText}
                  onToggleMute={call.toggleMute}
                  onHangup={call.hangup}
                />
              ) : (
                <EndedScreen
                  durationSec={call.ended?.durationSec ?? 0}
                  voucher={call.voucher}
                  onDone={call.dismissEnded}
                />
              )}
            </PhoneFrame>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
