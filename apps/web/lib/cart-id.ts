"use client";

import { useCallback, useEffect, useState } from "react";

export const CART_ID_KEY = "vr.cartId";

export function readCartId(): string | null {
  try {
    return window.localStorage.getItem(CART_ID_KEY);
  } catch {
    return null; // private windows and blocked storage
  }
}

export function writeCartId(id: string | null): void {
  try {
    if (id) window.localStorage.setItem(CART_ID_KEY, id);
    else window.localStorage.removeItem(CART_ID_KEY);
  } catch {
    /* the cart still works for this page view */
  }
}

/**
 * The cart id lives in localStorage so a reload keeps the cart. It is read in an effect, so the
 * server render and the first client render agree; `ready` says when the real value is known.
 */
export function useCartId() {
  const [cartId, setState] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setState(readCartId());
    setReady(true);
  }, []);

  const setCartId = useCallback((id: string | null) => {
    writeCartId(id);
    setState(id);
  }, []);

  return { cartId, setCartId, ready };
}
