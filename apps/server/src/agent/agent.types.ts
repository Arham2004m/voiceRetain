import type { Objection, Sentiment, TranscriptTurnDTO, VoucherCard } from "@voiceretain/shared";

export type Intent = "WILL_PURCHASE" | "UNDECIDED" | "DECLINED";

export interface CallAnalysis {
  sentiment: Sentiment;
  objection: Objection;
  intent: Intent;
  summary: string;
}

export interface AgentTurnResult {
  replyText: string;
  voucher?: VoucherCard;
  endsCall: boolean;
  endReason?: string;
  latencyMs: number;
  failed: boolean;
}

export interface Agent {
  runTurn(input: {
    callId: string;
    customerText: string;
    consecutiveFailures: number;
  }): Promise<AgentTurnResult>;
}

export interface Analyzer {
  analyze(turns: TranscriptTurnDTO[]): Promise<CallAnalysis>;
}
