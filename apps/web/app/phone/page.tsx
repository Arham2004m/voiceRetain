"use client";

import { useCallback, useEffect, useState } from "react";
import { EndedScreen } from "@/components/phone/EndedScreen";
import { IdleScreen } from "@/components/phone/IdleScreen";
import { formatPhone } from "@/lib/format";
import { InCallScreen } from "@/components/phone/InCallScreen";
import { PhoneFrame } from "@/components/phone/PhoneFrame";
import { RegisterPhone } from "@/components/phone/RegisterPhone";
import { RingingScreen } from "@/components/phone/RingingScreen";
import { usePhoneCall } from "@/lib/phone/usePhoneCall";

export const PHONE_KEY = "vr.phone";

function readPhone(): string | null {
  try {
    return window.localStorage.getItem(PHONE_KEY);
  } catch {
    return null;
  }
}

function writePhone(phone: string | null) {
  try {
    if (phone) window.localStorage.setItem(PHONE_KEY, phone);
    else window.localStorage.removeItem(PHONE_KEY);
  } catch {
    /* the phone still works until the page is closed */
  }
}

export default function PhonePage() {
  // undefined while the saved number has not been read yet.
  const [phone, setPhone] = useState<string | null | undefined>(undefined);
  useEffect(() => setPhone(readPhone()), []);

  const call = usePhoneCall(phone ?? null);

  const register = useCallback((value: string) => {
    writePhone(value);
    setPhone(value);
  }, []);
  const change = useCallback(() => {
    writePhone(null);
    setPhone(null);
  }, []);

  const { state } = call;
  const inCall =
    state === "connecting" || state === "listening" || state === "thinking" || state === "speaking";

  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-[72rem] items-center gap-10 px-4 py-8 lg:grid-cols-12 lg:gap-16">
      <title>Phone · ShopNest</title>

      <section className="lg:col-span-5">
        <h1 className="display text-6xl sm:text-8xl">The customer&rsquo;s phone.</h1>
        <p className="mt-5 max-w-[26rem]">
          Register the number you will type at checkout and keep this window open. When the cart is
          left behind, the call rings here.
        </p>
        {phone ? (
          <p className="mt-6">
            Answering for <strong className="num">{formatPhone(phone)}</strong>.{" "}
            <button
              type="button"
              onClick={change}
              className="hover:text-peacock cursor-pointer underline underline-offset-4"
            >
              Change number
            </button>
          </p>
        ) : null}
      </section>

      <div className="lg:col-span-7">
        <PhoneFrame ringing={state === "ringing"}>
          {phone === undefined ? null : phone === null ? (
            <RegisterPhone onRegister={register} />
          ) : state === "ringing" && call.incoming ? (
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
              recognition={call.recognition}
              onSend={call.sendText}
              onToggleMute={call.toggleMute}
              onHangup={call.hangup}
            />
          ) : state === "ended" ? (
            <EndedScreen
              durationSec={call.ended?.durationSec ?? 0}
              voucher={call.voucher}
              onDone={call.dismissEnded}
            />
          ) : (
            <IdleScreen
              phone={phone}
              connected={call.connected}
              missedNotice={call.missedNotice}
              voucher={call.voucher}
              error={call.error}
            />
          )}
        </PhoneFrame>
      </div>
    </main>
  );
}
