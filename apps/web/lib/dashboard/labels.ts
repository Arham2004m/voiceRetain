import type { Objection } from "@voiceretain/shared";

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
