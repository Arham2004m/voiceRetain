"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  MAX_UTTERANCE_CHARS,
  type AgentReplyPayload,
  type IncomingCallPayload,
  type VoucherCard,
} from "@voiceretain/shared";
import { getSocket } from "@/lib/socket";
import { getRingtone } from "@/lib/speech/ringtone";
import { useSpeechRecognition } from "@/lib/speech/useSpeechRecognition";
import { useSpeechSynthesis } from "@/lib/speech/useSpeechSynthesis";

export type PhoneState =
  | "unregistered"
  | "idle"
  | "ringing"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "ended";

export interface TranscriptLine {
  id: number;
  speaker: "AGENT" | "CUSTOMER";
  text: string;
}

export interface EndedInfo {
  callId: string;
  outcome: string;
  durationSec: number;
}

const RETURN_TO_IDLE_MS = 10_000;
export const MISSED_CALL_NOTICE = "Missed call from ShopNest";

interface ActiveCall {
  callId: string;
  answeredAt: number;
}

/**
 * The phone's call state machine. Turn-taking is half-duplex: the microphone is only on while
 * it is the customer's turn, so the agent never hears itself. Typed input always works.
 */
export function usePhoneCall(phone: string | null) {
  const [state, setStateValue] = useState<PhoneState>(phone ? "idle" : "unregistered");
  const [incoming, setIncoming] = useState<IncomingCallPayload>();
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [voucher, setVoucher] = useState<VoucherCard>();
  const [ended, setEnded] = useState<EndedInfo>();
  const [muted, setMuted] = useState(false);
  const [hangingUp, setHangingUp] = useState(false);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const [missedNotice, setMissedNotice] = useState<string>();
  const [error, setError] = useState<string>();
  const [connected, setConnected] = useState(false);
  const [answeredAt, setAnsweredAt] = useState<number | null>(null);

  const stateRef = useRef(state);
  const incomingRef = useRef<IncomingCallPayload | undefined>(undefined);
  const callRef = useRef<ActiveCall | null>(null);
  const mutedRef = useRef(false);
  const pendingEnd = useRef<EndedInfo | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lineId = useRef(1);

  const go = useCallback((next: PhoneState) => {
    stateRef.current = next;
    setStateValue(next);
  }, []);

  // The speech hooks return new objects each render; refs give callbacks the latest ones.
  const sendTextRef = useRef<(text: string) => void>(() => undefined);
  const rec = useSpeechRecognition({ onFinal: (text) => sendTextRef.current(text) });
  const tts = useSpeechSynthesis();
  const recRef = useRef(rec);
  recRef.current = rec;
  const ttsRef = useRef(tts);
  ttsRef.current = tts;

  const addLine = useCallback((speaker: TranscriptLine["speaker"], text: string) => {
    setTranscript((lines) => [...lines, { id: lineId.current++, speaker, text }]);
  }, []);

  const startListening = useCallback(() => {
    const r = recRef.current;
    if (!mutedRef.current && r.supported && r.permission !== "denied") r.start();
  }, []);

  const finishCall = useCallback(() => {
    const info = pendingEnd.current;
    pendingEnd.current = null;
    ttsRef.current.cancel();
    recRef.current.stop();
    setHangingUp(false);
    if (info) setEnded(info);
    go("ended");
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => dismissEnded(), RETURN_TO_IDLE_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [go]);

  const dismissEnded = useCallback(() => {
    clearTimeout(idleTimer.current);
    setEnded(undefined);
    setTranscript([]);
    setAnsweredAt(null);
    setIncoming(undefined);
    incomingRef.current = undefined;
    callRef.current = null;
    go("idle");
  }, [go]);

  /** Speak the agent's line with the microphone off, then hand the turn back. */
  const deliver = useCallback(
    (text: string, endsCall: boolean) => {
      recRef.current.stop();
      go("speaking");
      void ttsRef.current.speak(text).then(() => {
        if (pendingEnd.current) return finishCall();
        // The customer typed over the agent, or the call moved on: leave the state alone.
        if (stateRef.current !== "speaking") return;
        if (endsCall) return go("thinking"); // goodbye said; waiting for the call to end
        go("listening");
        startListening();
      });
    },
    [finishCall, go, startListening],
  );

  // ---- Socket wiring -------------------------------------------------------------------------
  useEffect(() => {
    if (!phone) {
      go("unregistered");
      return;
    }
    const socket = getSocket();
    if (stateRef.current === "unregistered") go("idle");

    const ring = (call: IncomingCallPayload) => {
      incomingRef.current = call;
      setIncoming(call);
      setMissedNotice(undefined);
      go("ringing");
    };

    const register = () => {
      socket.emit("phone:register", { phone }, (ack) => {
        if (!ack.ok) {
          setError(ack.error);
          return;
        }
        // A call that was still ringing when the page reloaded rings again.
        if (ack.activeCall && stateRef.current === "idle") ring(ack.activeCall);
      });
    };

    const onConnect = () => {
      setConnected(true);
      register();
    };
    const onDisconnect = () => setConnected(false);
    const onIncoming = (call: IncomingCallPayload) => {
      if (stateRef.current === "idle" || stateRef.current === "ended") ring(call);
    };
    const onReply = (reply: AgentReplyPayload) => {
      if (callRef.current?.callId !== reply.callId) return;
      addLine("AGENT", reply.text);
      if (reply.voucher) setVoucher(reply.voucher);
      deliver(reply.text, reply.endsCall);
    };
    const onEnded = (payload: { callId: string; outcome: string }) => {
      const call = callRef.current;
      if (!call || call.callId !== payload.callId) return;
      const info: EndedInfo = {
        callId: payload.callId,
        outcome: payload.outcome,
        durationSec: Math.max(0, Math.round((Date.now() - call.answeredAt) / 1000)),
      };
      pendingEnd.current = info;
      // Let a goodbye that is still being spoken finish first.
      if (stateRef.current === "speaking") return;
      finishCall();
    };
    const onRingCancelled = ({ callId }: { callId: string }) => {
      if (incomingRef.current?.callId !== callId || stateRef.current !== "ringing") return;
      incomingRef.current = undefined;
      setIncoming(undefined);
      setMissedNotice(MISSED_CALL_NOTICE);
      go("idle");
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("call:incoming", onIncoming);
    socket.on("call:agent-reply", onReply);
    socket.on("call:ended", onEnded);
    socket.on("call:ring-cancelled", onRingCancelled);
    if (socket.connected) onConnect();

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("call:incoming", onIncoming);
      socket.off("call:agent-reply", onReply);
      socket.off("call:ended", onEnded);
      socket.off("call:ring-cancelled", onRingCancelled);
    };
  }, [phone, go, addLine, deliver, finishCall]);

  // ---- The ringtone follows the ringing state --------------------------------------------------
  useEffect(() => {
    if (state !== "ringing") return;
    const ringtone = getRingtone();
    let cancelled = false;
    void ringtone.start().then((audible) => {
      if (!cancelled) setSoundBlocked(!audible);
    });
    return () => {
      cancelled = true;
      ringtone.stop();
      setSoundBlocked(false);
    };
  }, [state]);

  useEffect(() => () => clearTimeout(idleTimer.current), []);

  // ---- Actions -------------------------------------------------------------------------------
  const answer = useCallback(() => {
    const call = incomingRef.current;
    if (!call || stateRef.current !== "ringing") return;
    setError(undefined);
    setVoucher(undefined);
    setTranscript([]);
    go("connecting");
    getSocket().emit("call:answer", { callId: call.callId }, (ack) => {
      if (!ack.ok) {
        setError(ack.error);
        incomingRef.current = undefined;
        setIncoming(undefined);
        go("idle");
        return;
      }
      const startedAt = Date.now();
      callRef.current = { callId: call.callId, answeredAt: startedAt };
      setAnsweredAt(startedAt);
      addLine("AGENT", ack.greeting.text);
      deliver(ack.greeting.text, false);
    });
  }, [addLine, deliver, go]);

  const decline = useCallback(() => {
    const call = incomingRef.current;
    if (!call) return;
    getSocket().emit("call:decline", { callId: call.callId }, () => undefined);
    incomingRef.current = undefined;
    setIncoming(undefined);
    go("idle");
  }, [go]);

  const sendText = useCallback(
    (raw: string) => {
      const call = callRef.current;
      const text = raw.trim().slice(0, MAX_UTTERANCE_CHARS);
      if (!call || !text) return;
      if (stateRef.current !== "listening" && stateRef.current !== "speaking") return;
      ttsRef.current.cancel(); // typing over the agent interrupts it
      recRef.current.stop();
      addLine("CUSTOMER", text);
      go("thinking");
      getSocket().emit("call:utterance", { callId: call.callId, text }, (ack) => {
        if (ack.ok) return;
        setError(ack.error);
        go("listening");
        startListening();
      });
    },
    [addLine, go, startListening],
  );
  sendTextRef.current = sendText;

  const hangup = useCallback(() => {
    const call = callRef.current;
    if (!call) return;
    ttsRef.current.cancel();
    recRef.current.stop();
    setHangingUp(true);
    go("thinking");
    getSocket().emit("call:hangup", { callId: call.callId }, (ack) => {
      // The server says the call is not in progress: it already ended.
      if (!ack.ok && !pendingEnd.current) {
        pendingEnd.current = {
          callId: call.callId,
          outcome: "UNDECIDED",
          durationSec: Math.round((Date.now() - call.answeredAt) / 1000),
        };
        finishCall();
      }
    });
  }, [finishCall, go]);

  const toggleMute = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    if (next) recRef.current.stop();
    else if (stateRef.current === "listening") startListening();
  }, [startListening]);

  const enableSound = useCallback(async () => {
    const audible = await getRingtone().start();
    setSoundBlocked(!audible);
  }, []);

  return {
    state,
    incoming,
    transcript,
    voucher,
    ended,
    muted,
    hangingUp,
    soundBlocked,
    missedNotice,
    error,
    connected,
    answeredAt,
    speaking: tts.speaking,
    recognition: {
      supported: rec.supported,
      permission: rec.permission,
      listening: rec.listening,
      interim: rec.interim,
      error: rec.error,
    },
    answer,
    decline,
    hangup,
    sendText,
    toggleMute,
    dismissEnded,
    enableSound,
    clearError: () => setError(undefined),
  };
}
