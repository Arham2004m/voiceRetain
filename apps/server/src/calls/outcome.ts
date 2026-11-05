import type { CallOutcome } from "../generated/prisma/client";
import type { Intent } from "../agent/agent.types";

export interface OutcomeInput {
  status: "RINGING" | "IN_PROGRESS" | "ENDED" | "MISSED";
  answered: boolean;
  declinedWhileRinging: boolean;
  voucherIssued: boolean;
  /** Absent when the call produced no analysis. */
  intent?: Intent;
  orderPlaced: boolean;
}

/** PRD §7.3, evaluated top to bottom. The LLM never sets the outcome directly. */
export function decideOutcome(input: OutcomeInput): CallOutcome {
  if (!input.answered && !input.declinedWhileRinging) return "NO_ANSWER";
  if (input.declinedWhileRinging) return "DECLINED";
  if (input.orderPlaced) return "RECOVERED";
  if (input.intent === "WILL_PURCHASE") return "ACCEPTED_OFFER";
  if (input.voucherIssued && input.intent !== undefined && input.intent !== "DECLINED") {
    return "ACCEPTED_OFFER";
  }
  if (input.intent === "DECLINED") return "DECLINED";
  return "UNDECIDED";
}
