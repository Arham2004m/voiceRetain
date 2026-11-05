"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Chrome stops a long utterance after about 15 seconds, so speech is queued one sentence at a
 * time. A full stop inside a number ("₹1,499.50") is not a sentence end.
 */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** en-IN first, then any English voice, otherwise the browser default. */
export function pickVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  return (
    voices.find((v) => v.lang.toLowerCase().startsWith("en-in")) ??
    voices.find((v) => v.lang.toLowerCase().startsWith("en-"))
  );
}

export function useSpeechSynthesis() {
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const tokenRef = useRef(0);
  const finishRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    setSupported(true);
    const refresh = () => {
      voicesRef.current = synth.getVoices();
    };
    refresh();
    // Voices load asynchronously in Chrome.
    synth.addEventListener("voiceschanged", refresh);
    return () => synth.removeEventListener("voiceschanged", refresh);
  }, []);

  const cancel = useCallback(() => {
    tokenRef.current++;
    const finish = finishRef.current;
    finishRef.current = null;
    if (typeof window !== "undefined" && "speechSynthesis" in window)
      window.speechSynthesis.cancel();
    setSpeaking(false);
    finish?.();
  }, []);

  const speak = useCallback((text: string): Promise<void> => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return Promise.resolve();
    const parts = splitSentences(text);
    if (parts.length === 0) return Promise.resolve();

    const synth = window.speechSynthesis;
    // A new line replaces whatever is still being said.
    finishRef.current?.();
    const token = ++tokenRef.current;

    return new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        if (finishRef.current === finish) finishRef.current = null;
        if (token === tokenRef.current) setSpeaking(false);
        resolve();
      };
      finishRef.current = finish;
      setSpeaking(true);

      let index = 0;
      const next = () => {
        if (token !== tokenRef.current || index >= parts.length) return finish();
        const utterance = new SpeechSynthesisUtterance(parts[index++]);
        utterance.lang = "en-IN";
        utterance.rate = 1;
        const voice = pickVoice(voicesRef.current);
        if (voice) utterance.voice = voice;
        // An error must not stall the call: carry on with the next sentence.
        utterance.onend = next;
        utterance.onerror = next;
        synth.speak(utterance);
      };
      next();
    });
  }, []);

  useEffect(() => () => cancel(), [cancel]);

  return { supported, speaking, speak, cancel };
}
