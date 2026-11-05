import { HARD_MAX_DISCOUNT } from "@voiceretain/shared";
import type { CallAnalysis } from "./agent.types";
import type {
  ChatMessage,
  FunctionCallRequest,
  GenerateRequest,
  GenerateResult,
  LlmClient,
} from "./llm.types";
import { END_CALL, ISSUE_DISCOUNT_CODE } from "./tools";

export interface MockLlmOptions {
  /** Simulated model latency; PRD §8.7 asks for 300 ms so the demo feels realistic. */
  latencyMs?: number;
  /** MAX_DISCOUNT_PERCENT, so "the best I can do" matches what the server will grant. */
  maxDiscountPercent?: number;
}

const CLARIFY = "Got it. Is it the price or the delivery that's holding you back?";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const issue = (percent: number, reason: string): FunctionCallRequest => ({
  name: ISSUE_DISCOUNT_CODE,
  args: { percent, reason },
});
const end = (reason: string): FunctionCallRequest => ({ name: END_CALL, args: { reason } });

/** Deterministic stand-in for Gemini (PRD §8.7). Rules are checked top to bottom. */
export class MockLlmClient implements LlmClient {
  private latencyMs: number;
  private cap: number;

  constructor(opts: MockLlmOptions = {}) {
    this.latencyMs = opts.latencyMs ?? 300;
    this.cap = Math.min(opts.maxDiscountPercent ?? HARD_MAX_DISCOUNT, HARD_MAX_DISCOUNT);
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    await sleep(this.latencyMs);
    const last = req.history[req.history.length - 1];
    if (last?.functionResponses?.length) return this.followUp(req.history, last);
    return this.respondTo((last?.text ?? "").toLowerCase());
  }

  private respondTo(text: string): GenerateResult {
    if (/\bship\w*/.test(text)) return { functionCalls: [issue(10, "SHIPPING_COST")] };
    if (/\b(expensive|price|costly|cheaper)\b/.test(text)) {
      return { functionCalls: [issue(10, "PRICE")] };
    }
    const ask = /(\d+(?:\.\d+)?)\s*(?:%|percent)/.exec(text);
    if (ask && Number(ask[1]) >= 16) return { functionCalls: [issue(this.cap, "HESITATION")] };
    if (/\b(bye|no thanks|not interested|stop)\b/.test(text)) {
      return { text: "No problem at all. Have a great day!", functionCalls: [end("DECLINED")] };
    }
    if (/\b(ok|okay|yes|sure|will buy|order)\b/.test(text)) {
      return {
        text: "Wonderful! Just use the link on your screen to finish. Goodbye!",
        functionCalls: [end("WILL_PURCHASE")],
      };
    }
    return { text: CLARIFY, functionCalls: [] };
  }

  /** Behaves like a real model after a tool result: turns the result into spoken text. */
  private followUp(history: ChatMessage[], last: ChatMessage): GenerateResult {
    const response = last.functionResponses?.[0]?.response ?? {};
    const asked = [...history].reverse().find((m) => m.role === "model" && m.functionCalls?.length)
      ?.functionCalls?.[0];

    if (asked?.name !== ISSUE_DISCOUNT_CODE) return { text: CLARIFY, functionCalls: [] };
    if (response.ok !== true) {
      return {
        text: "I'm sorry, I'm not able to offer a discount on this order.",
        functionCalls: [],
      };
    }
    const percent = Number(response.percent);
    const spoken = String(response.spokenCode ?? "");
    if (response.alreadyIssued === true) {
      return {
        text: `You already have ${percent} percent off — your code is ${spoken}.`,
        functionCalls: [],
      };
    }
    if (asked.args.reason === "HESITATION") {
      return {
        text: `${percent} percent is the best I can do, and I'm happy to apply that for you.`,
        functionCalls: [],
      };
    }
    return {
      text: `I understand, shipping adds up. I can give you ${percent} percent off right now — your code is ${spoken}.`,
      functionCalls: [],
    };
  }

  async analyze(req: { transcript: string; timeoutMs: number }): Promise<CallAnalysis> {
    await sleep(this.latencyMs);
    const lines = req.transcript.split("\n");
    const customer = lines.filter((l) => l.startsWith("Customer:")).map((l) => l.toLowerCase());
    const agent = lines.filter((l) => l.startsWith("Agent:"));

    const voucherIssued = agent.some((l) => /your code is/i.test(l));
    const declined = agent.some((l) => /have a great day/i.test(l));
    const intent: CallAnalysis["intent"] = voucherIssued
      ? "WILL_PURCHASE"
      : declined
        ? "DECLINED"
        : "UNDECIDED";
    const sentiment: CallAnalysis["sentiment"] =
      intent === "WILL_PURCHASE" ? "POSITIVE" : intent === "DECLINED" ? "NEGATIVE" : "NEUTRAL";

    let objection: CallAnalysis["objection"] = "NONE";
    for (const line of customer) {
      if (/\bship\w*/.test(line)) objection = "SHIPPING_COST";
      else if (/\b(expensive|price|costly|cheaper)\b/.test(line)) objection = "PRICE";
      if (objection !== "NONE") break;
    }

    const summary = {
      WILL_PURCHASE: voucherIssued
        ? `Customer raised ${objection.toLowerCase().replace("_", " ")} and accepted a discount code.`
        : "Customer plans to complete the order.",
      DECLINED: "Customer declined to continue with the order.",
      UNDECIDED: "Customer was undecided about the order.",
    }[intent];
    return { sentiment, objection, intent, summary: summary.slice(0, 200) };
  }
}
