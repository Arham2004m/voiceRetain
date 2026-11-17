"use client";

import { useEffect, useState, type CSSProperties } from "react";
import type { VoucherCard } from "@voiceretain/shared";
import type { MicPermission } from "@/lib/speech/useSpeechRecognition";
import type { PhoneState, TranscriptLine } from "@/lib/phone/usePhoneCall";
import { TranscriptView } from "./TranscriptView";
import { TypedInput } from "./TypedInput";
import { VoucherCardView } from "./VoucherCardView";

interface Props {
  state: PhoneState;
  transcript: TranscriptLine[];
  voucher?: VoucherCard;
  answeredAt: number | null;
  muted: boolean;
  hangingUp: boolean;
  /** False while the live connection to the server is down. */
  connected?: boolean;
  recognition: {
    supported: boolean;
    permission: MicPermission;
    listening: boolean;
    interim: string;
    /** Last recognition error code from the browser, e.g. "network" or "audio-capture". */
    error?: string | null;
  };
  onSend: (text: string) => void;
  onToggleMute: () => void;
  onHangup: () => void;
}

export const formatClock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

function useElapsed(since: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return since === null ? 0 : Math.max(0, Math.floor((now - since) / 1000));
}

/** Decorative bars: marigold while the agent speaks, green while the shopper's mic is open. */
function VoiceBars({ mode }: { mode: "agent" | "you" | "idle" }) {
  const heights = [0.5, 0.9, 0.65, 1, 0.55];
  return (
    <span aria-hidden data-voice-bars={mode} className="flex h-6 items-center gap-[3px]">
      {heights.map((h, i) => (
        <span
          key={i}
          style={
            {
              height: `${h * 100}%`,
              "--bar-time": `${0.7 + i * 0.09}s`,
              "--bar-delay": `${i * 0.08}s`,
            } as CSSProperties
          }
          className={`voice-bar w-[3px] origin-center rounded-full ${
            mode === "agent" ? "bg-marigold" : mode === "you" ? "bg-leaf" : "bg-paper/40"
          }`}
        />
      ))}
    </span>
  );
}

export function InCallScreen(props: Props) {
  const { state, recognition, muted, hangingUp, connected = true } = props;
  const elapsed = useElapsed(props.answeredAt);

  const micUsable = recognition.supported && recognition.permission !== "denied";
  const status = hangingUp
    ? "Ending call…"
    : state === "connecting"
      ? "Connecting…"
      : state === "speaking"
        ? "Agent speaking"
        : state === "thinking"
          ? "Thinking…"
          : !micUsable
            ? "Your turn"
            : muted
              ? "Microphone muted"
              : "Listening";

  const notice = !recognition.supported
    ? "Voice works best in Chrome or Edge — type your replies below."
    : recognition.permission === "denied"
      ? "Microphone access is blocked. Type your replies below, or allow the microphone in your browser settings."
      : recognition.error === "network"
        ? "The browser could not reach its speech service (needs internet, and does not work in some browsers). Type your replies below."
        : recognition.error === "audio-capture"
          ? "No microphone was found. Check your input device, or type your replies below."
          : recognition.error
            ? `Speech recognition stopped (${recognition.error}). Type your replies below.`
            : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col pt-7">
      <header className="flex items-end justify-between px-4 pb-2">
        <div>
          <h2 className="display text-4xl">ShopNest</h2>
          <p className="num text-paper/70 text-sm">{formatClock(elapsed)}</p>
        </div>
        <p
          className="bg-paper/10 flex items-center gap-2 px-3 py-1.5 text-sm font-semibold"
          aria-live="polite"
        >
          <VoiceBars
            mode={
              hangingUp || state === "connecting" || state === "thinking"
                ? "idle"
                : state === "speaking"
                  ? "agent"
                  : micUsable && !muted && recognition.listening
                    ? "you"
                    : "idle"
            }
          />
          {status}
        </p>
      </header>

      {connected ? null : (
        <p role="status" className="bg-marigold text-ink mx-4 mb-2 px-3 py-2 text-sm font-semibold">
          Reconnecting… the agent may be quiet for a moment.
        </p>
      )}

      <TranscriptView lines={props.transcript} interim={recognition.interim} />

      {props.voucher ? (
        <div className="px-4 pb-3">
          <VoucherCardView voucher={props.voucher} />
        </div>
      ) : null}

      {notice ? <p className="text-marigold px-4 pb-2 text-sm">{notice}</p> : null}

      <div className="flex items-center gap-2 px-4 pb-3">
        {recognition.supported ? (
          <button
            type="button"
            onClick={props.onToggleMute}
            aria-pressed={muted}
            aria-label={muted ? "Unmute microphone" : "Mute microphone"}
            className="border-paper/40 hover:bg-paper hover:text-ink min-h-11 cursor-pointer border-2 px-4 font-semibold transition-colors aria-pressed:bg-paper aria-pressed:text-ink"
          >
            {muted ? "Unmute" : "Mute"}
          </button>
        ) : null}
        <button
          type="button"
          onClick={props.onHangup}
          disabled={hangingUp}
          className="bg-kumkum hover:bg-paper hover:text-kumkum min-h-11 flex-1 cursor-pointer px-4 font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50"
        >
          Hang up
        </button>
      </div>

      <TypedInput onSend={props.onSend} autoFocus={!micUsable} />
    </div>
  );
}
