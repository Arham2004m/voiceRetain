export type CartStatus = "ACTIVE" | "CHECKOUT_STARTED" | "ABANDONED" | "RECOVERED" | "COMPLETED";
export type CallStatus = "RINGING" | "IN_PROGRESS" | "ENDED" | "MISSED";
export type CallOutcome =
  "PENDING" | "RECOVERED" | "ACCEPTED_OFFER" | "UNDECIDED" | "DECLINED" | "NO_ANSWER";
export type Sentiment = "POSITIVE" | "NEUTRAL" | "NEGATIVE";
export type Objection =
  "SHIPPING_COST" | "PRICE" | "TRUST" | "TIMING" | "CHANGED_MIND" | "OTHER" | "NONE";
export type Speaker = "AGENT" | "CUSTOMER" | "SYSTEM";
export type VoucherStatus = "ACTIVE" | "SUPERSEDED" | "REDEEMED" | "EXPIRED";

export interface ProductDTO {
  id: string;
  slug: string;
  name: string;
  description: string;
  pricePaise: number;
  imageUrl: string;
  category: string;
}

export interface CartDTO {
  id: string;
  status: CartStatus;
  items: {
    productId: string;
    name: string;
    quantity: number;
    unitPricePaise: number;
    imageUrl: string;
  }[];
  subtotalPaise: number;
  customer?: { name: string; phone: string };
}

export interface OrderDTO {
  id: string;
  cartId: string;
  voucherCode?: string;
  subtotalPaise: number;
  discountPaise: number;
  shippingPaise: number;
  totalPaise: number;
  createdAt: string;
}

export interface VoucherDTO {
  id: string;
  code: string;
  percent: number;
  status: VoucherStatus;
  cartId: string;
  callId: string | null;
  expiresAt: string;
  redeemedAt: string | null;
  createdAt: string;
}

export interface VoucherCard {
  code: string;
  percent: number;
  expiresAt: string;
  cartId: string;
}

export interface TranscriptTurnDTO {
  id: string;
  callId: string;
  speaker: Speaker;
  text: string;
  latencyMs: number | null;
  createdAt: string;
}

export interface CallSummaryDTO {
  id: string;
  cartId: string;
  customerName: string;
  customerPhone: string;
  cartTotalPaise: number;
  status: CallStatus;
  outcome: CallOutcome;
  sentiment: Sentiment | null;
  objection: Objection | null;
  summary: string | null;
  durationSec: number | null;
  startedAt: string;
}

export interface CallDetailDTO extends CallSummaryDTO {
  endReason: string | null;
  answeredAt: string | null;
  endedAt: string | null;
  avgLatencyMs: number | null;
  turns: TranscriptTurnDTO[];
  vouchers: VoucherDTO[];
  order: OrderDTO | null;
}

export interface DashboardMetrics {
  abandonedCarts: number;
  callsPlaced: number;
  answerRate: number;
  recoveredCarts: number;
  recoveryRate: number;
  revenueRecoveredPaise: number;
  avgLatencyMs: number | null;
  sentiment: { POSITIVE: number; NEUTRAL: number; NEGATIVE: number };
  last7Days: { date: string; revenueRecoveredPaise: number }[];
}

export interface SearchResults {
  customers: { id: string; name: string; phone: string }[];
  calls: CallSummaryDTO[];
  vouchers: VoucherDTO[];
}

export interface ApiError {
  error: { code: string; message: string; details?: unknown };
}
