"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** The slice of the Web Speech API this app uses. */
interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onresult: ((e: RecognitionResultEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
interface RecognitionResultEvent {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
}
type RecognitionCtor = new () => RecognitionLike;

function getCtor(): RecognitionCtor | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export type MicPermission = "unknown" | "granted" | "denied";

/**
 * One utterance per start(): after a final result the hook stops wanting to listen, and the
 * caller starts it again when it is the customer's turn (half-duplex, so the agent never hears
 * itself). A no-speech timeout restarts quietly while the caller still wants input.
 */
export function useSpeechRecognition({
  lang = "en-IN",
  onFinal,
}: {
  lang?: string;
  onFinal: (text: string) => void;
}) {
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<MicPermission>("unknown");
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recRef = useRef<RecognitionLike | null>(null);
  const wantRef = useRef(false);
  const deniedRef = useRef(false);
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  useEffect(() => {
    setSupported(getCtor() !== undefined);
    return () => {
      wantRef.current = false;
      recRef.current?.abort();
    };
  }, []);

  const ensure = useCallback((): RecognitionLike | null => {
    if (recRef.current) return recRef.current;
    const Ctor = getCtor();
    if (!Ctor) return null;
    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = false;
    rec.interimResults = true;

    rec.onstart = () => {
      setListening(true);
      setPermission("granted");
    };
    rec.onresult = (e) => {
      let finalText = "";
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        if (!result?.[0]) continue;
        if (result.isFinal) finalText += result[0].transcript;
        else interimText += result[0].transcript;
      }
      if (finalText.trim()) {
        setInterim("");
        wantRef.current = false;
        onFinalRef.current(finalText.trim());
      } else if (interimText) {
        setInterim(interimText);
      }
    };
    rec.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        deniedRef.current = true;
        wantRef.current = false;
        setPermission("denied");
        return;
      }
      setError(e.error);
    };
    rec.onend = () => {
      setListening(false);
      setInterim("");
      if (wantRef.current && !deniedRef.current) {
        try {
          rec.start();
        } catch {
          /* already started */
        }
      }
    };
    recRef.current = rec;
    return rec;
  }, [lang]);

  const start = useCallback(() => {
    if (deniedRef.current) return;
    const rec = ensure();
    if (!rec) return;
    wantRef.current = true;
    setError(null);
    try {
      rec.start();
    } catch {
      /* already started */
    }
  }, [ensure]);

  const stop = useCallback(() => {
    wantRef.current = false;
    recRef.current?.stop();
    setListening(false);
    setInterim("");
  }, []);

  return { supported, permission, listening, interim, error, start, stop };
}
