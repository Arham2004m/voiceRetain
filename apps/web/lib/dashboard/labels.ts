import type { Objection, VoucherStatus } from "@voiceretain/shared";

const OBJECTIONS: Record<Objection, string> = {
  SHIPPING_COST: "Shipping cost",
  PRICE: "Price",
  TRUST: "Trust",
  TIMING: "Timing",
  CHANGED_MIND: "Changed their mind",
  OTHER: "Something else",
  NONE: "None raised",
};

export const objectionLabel = (o: Objection | null) => (o ? OBJECTIONS[o] : "Not analysed yet");

const END_REASONS: Record<string, string> = {
  CUSTOMER_HANGUP: "The customer hung up",
  AGENT_ENDED: "The agent ended the call",
  MAX_DURATION: "It reached the time limit",
  DISCONNECTED: "The phone disconnected",
  LLM_FAILURE: "The AI had trouble answering",
  SERVER_RESTART: "The server restarted",
  DECLINED: "The customer declined",
};

export const endReasonLabel = (reason: string | null) =>
  reason ? (END_REASONS[reason] ?? reason) : "Still going";

/**
 * The server only marks a code EXPIRED when someone tries to use it, so an old ACTIVE code can
 * linger in the database. The dashboard shows what is actually true.
 */
export function effectiveVoucherStatus(
  v: { status: VoucherStatus; expiresAt: string },
  now: Date = new Date(),
): VoucherStatus {
  return v.status === "ACTIVE" && new Date(v.expiresAt) <= now ? "EXPIRED" : v.status;
}
