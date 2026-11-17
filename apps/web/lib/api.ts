import type {
  CallDetailDTO,
  CallSummaryDTO,
  CartDTO,
  CheckoutInputType,
  DashboardMetrics,
  OrderDTO,
  ProductDTO,
  SearchResults,
  VoucherDTO,
} from "@voiceretain/shared";

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

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/** `?a=1&b=2`, leaving out anything undefined or empty. */
export function queryString(params: Record<string, string | number | undefined>): string {
  const pairs = Object.entries(params).filter(([, v]) => v !== undefined && v !== "");
  if (pairs.length === 0) return "";
  return `?${pairs.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join("&")}`;
}

export interface CallFilters {
  cursor?: string;
  limit?: number;
  outcome?: string;
  sentiment?: string;
  customerId?: string;
}

export interface DemoConfig {
  abandonDelayMs: number;
  mockLlm: boolean;
}

export type CatalogueSync =
  | { source: "dummyjson"; synced: number; skipped: number; retired: number }
  | { source: "kept" | "fallback"; synced: number; error: string };

export const api = {
  // Dashboard
  getMetrics: () => request<DashboardMetrics>("/dashboard/metrics"),
  listCalls: (filters: CallFilters = {}) =>
    request<Page<CallSummaryDTO>>(`/calls${queryString({ ...filters })}`),
  getCall: (id: string) => request<CallDetailDTO>(`/calls/${id}`),
  listVouchers: (filters: { cursor?: string; limit?: number; status?: string } = {}) =>
    request<Page<VoucherDTO>>(`/vouchers${queryString({ ...filters })}`),
  search: (q: string) => request<SearchResults>(`/search${queryString({ q })}`),

  // Demo controls
  getDemoConfig: () => request<DemoConfig>("/demo/config"),
  setDemoDelay: (abandonDelayMs: number) =>
    request<DemoConfig>("/demo/config", { method: "PUT", body: { abandonDelayMs } }),
  triggerLatest: () => post<{ cartId: string }>("/demo/trigger-latest", {}),
  resetDemo: () => post<{ ok: true }>("/demo/reset", {}),
  syncCatalogue: () => post<CatalogueSync>("/demo/sync-catalogue", {}),

  // Store
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
