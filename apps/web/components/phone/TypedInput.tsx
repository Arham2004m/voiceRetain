"use client";

import { useState, type FormEvent } from "react";
import { MAX_UTTERANCE_CHARS } from "@voiceretain/shared";

/** Typing always works, so a call can be completed with no microphone at all. */
export function TypedInput({
  onSend,
  autoFocus = false,
}: {
  onSend: (text: string) => void;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const clean = text.trim();
    if (!clean) return;
    onSend(clean);
    setText("");
  };

  return (
    <form onSubmit={submit} className="flex gap-2 px-4 pb-4">
      <label htmlFor="typed-reply" className="sr-only">
        Type your reply
      </label>
      <input
        id="typed-reply"
        value={text}
        onChange={(e) => setText(e.target.value)}
        autoFocus={autoFocus}
        autoComplete="off"
        maxLength={MAX_UTTERANCE_CHARS}
        placeholder="Type your reply"
        className="bg-paper text-ink placeholder:text-ink-soft min-h-12 min-w-0 flex-1 px-3"
      />
      <button
        type="submit"
        className="bg-marigold text-ink hover:bg-paper min-h-12 cursor-pointer px-4 font-semibold transition-colors"
      >
        Send
      </button>
    </form>
  );
}
