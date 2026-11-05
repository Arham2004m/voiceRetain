import { z } from "zod";
import type { CallAnalysis } from "./agent.types";
import type { ToolDeclaration } from "./tools";

export interface FunctionCallRequest {
  name: string;
  args: Record<string, unknown>;
  id?: string;
}

export interface FunctionResponseMessage {
  name: string;
  response: Record<string, unknown>;
  id?: string;
}

/**
 * One turn of the conversation. A model turn may request several function calls and the reply
 * carries one response per call. `raw` keeps the provider's own content object so things like
 * Gemini thought signatures are replayed unchanged on the next request.
 */
export interface ChatMessage {
  role: "user" | "model";
  text?: string;
  functionCalls?: FunctionCallRequest[];
  functionResponses?: FunctionResponseMessage[];
  raw?: unknown;
}

export interface GenerateRequest {
  systemPrompt: string;
  history: ChatMessage[];
  tools: ToolDeclaration[];
  timeoutMs: number;
}

export interface GenerateResult {
  text?: string;
  functionCalls: FunctionCallRequest[];
  raw?: unknown;
}

export interface LlmClient {
  generate(req: GenerateRequest): Promise<GenerateResult>;
  analyze(req: { transcript: string; timeoutMs: number }): Promise<CallAnalysis>;
}

export type LlmErrorKind = "TIMEOUT" | "RATE_LIMIT" | "SERVER" | "BAD_RESPONSE";

export class LlmError extends Error {
  constructor(
    public kind: LlmErrorKind,
    message: string,
    public cause?: unknown,
  ) {
    super(message);
  }
}

export const CallAnalysisSchema = z.object({
  sentiment: z.enum(["POSITIVE", "NEUTRAL", "NEGATIVE"]),
  objection: z.enum(["SHIPPING_COST", "PRICE", "TRUST", "TIMING", "CHANGED_MIND", "OTHER", "NONE"]),
  intent: z.enum(["WILL_PURCHASE", "UNDECIDED", "DECLINED"]),
  summary: z.string().transform((s) => s.slice(0, 200)),
});
