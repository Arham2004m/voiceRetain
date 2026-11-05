import type { CartDTO, CheckoutInputType, OrderDTO, ProductDTO } from "@voiceretain/shared";

export class ApiClientError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export type VoucherValidation =
  | { valid: true; percent: number; discountPaise: number }
  | { valid: false; reason: "NOT_FOUND" | "WRONG_CART" | "EXPIRED" | "NOT_ACTIVE" };

type CartItemInput = { productId: string; quantity: number };

// Read at call time so tests (and a changed env) are honoured.
const baseUrl = () => process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function request<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl()}/api${path}`, {
      method: init.method ?? "GET",
      headers: { "content-type": "application/json" },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      cache: "no-store",
    });
  } catch {
    throw new ApiClientError(
      0,
      "NETWORK_ERROR",
      "Can't reach ShopNest right now. Check your connection and try again.",
    );
  }

  if (!res.ok) {
    const parsed = (await res.json().catch(() => null)) as {
      error?: { code?: string; message?: string; details?: unknown };
    } | null;
    throw new ApiClientError(
      res.status,
      parsed?.error?.code ?? `HTTP_${res.status}`,
      parsed?.error?.message ?? `Request failed (${res.status})`,
      parsed?.error?.details,
    );
  }
  return (await res.json()) as T;
}

const post = <T>(path: string, body: unknown) => request<T>(path, { method: "POST", body });

export const api = {
  getProducts: () => request<ProductDTO[]>("/products"),
  createCart: (items: CartItemInput[]) => post<CartDTO>("/carts", { items }),
  getCart: (id: string) => request<CartDTO>(`/carts/${id}`),
  replaceItems: (id: string, items: CartItemInput[]) =>
    request<CartDTO>(`/carts/${id}/items`, { method: "PUT", body: { items } }),
  checkout: (id: string, input: CheckoutInputType) => post<CartDTO>(`/carts/${id}/checkout`, input),
  validateVoucher: (input: { code: string; cartId: string }) =>
    post<VoucherValidation>("/vouchers/validate", input),
  completeOrder: (id: string, voucherCode?: string) =>
    post<OrderDTO>(`/carts/${id}/complete`, voucherCode ? { voucherCode } : {}),
  getOrder: (id: string) => request<OrderDTO>(`/orders/${id}`),
};
