"use client";

import { useSyncExternalStore } from "react";

/** The number this browser answers for. Shared by the /phone page and the in-store call popup. */
export const PHONE_KEY = "vr.phone";
const CHANGE_EVENT = "vr:phone-change";

// Used when localStorage is blocked, so the popup still works until the tab closes.
let memory: string | null = null;

export function readPhone(): string | null {
  try {
    return window.localStorage.getItem(PHONE_KEY) ?? memory;
  } catch {
    return memory;
  }
}

export function writePhone(phone: string | null) {
  memory = phone;
  try {
    if (phone) window.localStorage.setItem(PHONE_KEY, phone);
    else window.localStorage.removeItem(PHONE_KEY);
  } catch {
    /* kept in memory */
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function subscribePhone(listener: () => void) {
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener("storage", listener); // another tab changed it
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

/** The registered number, or null. Re-renders when it changes in this or another tab. */
export function useRegisteredPhone(): string | null {
  return useSyncExternalStore(subscribePhone, readPhone, () => null);
}
