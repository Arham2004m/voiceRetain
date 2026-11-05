"use client";

import { useState, type FormEvent } from "react";
import { isValidIndianMobile, normalizePhone } from "@voiceretain/shared";
import { getRingtone } from "@/lib/speech/ringtone";

/** First visit: choose the number this phone answers for. */
export function RegisterPhone({ onRegister }: { onRegister: (phone: string) => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string>();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const phone = normalizePhone(value.trim()) ?? value;
    if (!isValidIndianMobile(phone)) {
      setError("Enter a 10-digit mobile number starting with 6, 7, 8 or 9.");
      return;
    }
    // This click is the gesture that lets the browser play the ringtone later.
    void getRingtone().unlock();
    onRegister(phone);
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-1 flex-col gap-5 px-6 pt-16 pb-8">
      <h2 className="display text-6xl">Set up this phone</h2>
      <p className="text-paper/80">
        Enter the mobile number you will use at checkout. Calls for that number ring here.
      </p>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="phone-number" className="font-semibold">
          Mobile number
        </label>
        <input
          id="phone-number"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(undefined);
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "phone-number-error" : undefined}
          className="bg-paper text-ink min-h-12 px-3 text-lg"
        />
        {error ? (
          <p id="phone-number-error" role="alert" className="text-marigold text-sm font-medium">
            {error}
          </p>
        ) : null}
      </div>
      <button
        type="submit"
        className="bg-marigold text-ink hover:bg-paper min-h-12 cursor-pointer px-6 font-semibold transition-colors"
      >
        Register this phone
      </button>
    </form>
  );
}
