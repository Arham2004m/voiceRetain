"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { CartDTO, ProductDTO } from "@voiceretain/shared";
import { ApiClientError, api } from "@/lib/api";
import { readCartId, writeCartId } from "@/lib/cart-id";
import { useToast } from "@/components/ui/Toast";

const MAX_QTY = 10;
type Item = CartDTO["items"][number];

interface CartContextValue {
  cart: CartDTO | null;
  /** False until the saved cart (if any) has been loaded. */
  ready: boolean;
  count: number;
  add(product: ProductDTO): void;
  setQuantity(productId: string, quantity: number): void;
  remove(productId: string): void;
  /** Make a cart id from a link (e.g. the phone's "Complete my order") the current cart. */
  adopt(cartId: string): Promise<CartDTO | null>;
  /** Replace the cart with a fresh server copy (after checkout). */
  replace(cart: CartDTO): void;
  /** Forget the cart (after the order is placed). */
  clear(): void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
}

const subtotalOf = (items: Item[]) =>
  items.reduce((sum, i) => sum + i.quantity * i.unitPricePaise, 0);

export function CartProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const [cart, setCart] = useState<CartDTO | null>(null);
  const [ready, setReady] = useState(false);
  // Refs hold the latest values so rapid clicks build on each other instead of on stale state.
  const cartRef = useRef<CartDTO | null>(null);
  const idRef = useRef<string | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());

  const apply = useCallback((next: CartDTO | null) => {
    cartRef.current = next;
    idRef.current = next && next.id !== "pending" ? next.id : idRef.current;
    setCart(next);
  }, []);

  const forget = useCallback(() => {
    idRef.current = null;
    writeCartId(null);
    apply(null);
  }, [apply]);

  const adopt = useCallback(
    async (cartId: string) => {
      try {
        const loaded = await api.getCart(cartId);
        idRef.current = loaded.id;
        writeCartId(loaded.id);
        apply(loaded);
        return loaded;
      } catch (err) {
        forget();
        if (!(err instanceof ApiClientError && err.status === 404)) {
          toast.push(err instanceof Error ? err.message : "Could not load your cart.", "error");
        }
        return null;
      }
    },
    [apply, forget, toast],
  );

  // Load the saved cart once on the first render in the browser.
  useEffect(() => {
    const saved = readCartId();
    if (!saved) {
      setReady(true);
      return;
    }
    void adopt(saved).then((loaded) => {
      if (loaded && (loaded.status === "COMPLETED" || loaded.status === "RECOVERED")) forget();
      setReady(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Show the change at once, then save it; if saving fails, reload the server's version. */
  const mutate = useCallback(
    (items: Item[]) => {
      const before = cartRef.current;
      apply({
        id: before?.id ?? "pending",
        status: before?.status ?? "ACTIVE",
        ...(before?.customer ? { customer: before.customer } : {}),
        items,
        subtotalPaise: subtotalOf(items),
      });

      queue.current = queue.current.then(async () => {
        const payload = items.map((i) => ({ productId: i.productId, quantity: i.quantity }));
        try {
          const id = idRef.current;
          if (!id && payload.length === 0) return;
          const saved = id ? await api.replaceItems(id, payload) : await api.createCart(payload);
          idRef.current = saved.id;
          writeCartId(saved.id);
          // Keep the local items (they may include newer clicks still queued behind this save);
          // take only the identity and status from the server.
          const local = cartRef.current;
          if (local) {
            apply({
              ...local,
              id: saved.id,
              status: saved.status,
              ...(saved.customer ? { customer: saved.customer } : {}),
            });
          }
        } catch (err) {
          if (err instanceof ApiClientError && err.status === 409) {
            forget();
            toast.push("That cart was already ordered, so we started a fresh one.", "error");
            return;
          }
          toast.push(
            err instanceof Error ? err.message : "Could not update your cart. Try again.",
            "error",
          );
          const id = idRef.current;
          if (id) {
            const server = await api.getCart(id).catch(() => null);
            apply(server ?? before);
          } else {
            apply(before);
          }
        }
      });
    },
    [apply, forget, toast],
  );

  const add = useCallback(
    (product: ProductDTO) => {
      const items = [...(cartRef.current?.items ?? [])];
      const existing = items.find((i) => i.productId === product.id);
      if (existing) {
        if (existing.quantity >= MAX_QTY) {
          toast.push(`You can order up to ${MAX_QTY} of one item.`);
          return;
        }
        mutate(items.map((i) => (i === existing ? { ...i, quantity: i.quantity + 1 } : i)));
      } else {
        mutate([
          ...items,
          {
            productId: product.id,
            name: product.name,
            quantity: 1,
            unitPricePaise: product.pricePaise,
            imageUrl: product.imageUrl,
          },
        ]);
      }
    },
    [mutate, toast],
  );

  const setQuantity = useCallback(
    (productId: string, quantity: number) => {
      const items = cartRef.current?.items ?? [];
      const clamped = Math.min(MAX_QTY, quantity);
      mutate(
        clamped <= 0
          ? items.filter((i) => i.productId !== productId)
          : items.map((i) => (i.productId === productId ? { ...i, quantity: clamped } : i)),
      );
    },
    [mutate],
  );

  const remove = useCallback((productId: string) => setQuantity(productId, 0), [setQuantity]);

  const value = useMemo<CartContextValue>(
    () => ({
      cart,
      ready,
      count: cart?.items.reduce((n, i) => n + i.quantity, 0) ?? 0,
      add,
      setQuantity,
      remove,
      adopt,
      replace: apply,
      clear: forget,
    }),
    [cart, ready, add, setQuantity, remove, adopt, apply, forget],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
