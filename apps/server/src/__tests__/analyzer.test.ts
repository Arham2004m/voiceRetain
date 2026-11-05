import { describe, expect, it, vi } from "vitest";
import type { TranscriptTurnDTO } from "@voiceretain/shared";
import { createAnalyzer } from "../agent/analyzer.service";
import type { CallAnalysis } from "../agent/agent.types";
import type { LlmClient } from "../agent/llm.types";

const turn = (speaker: TranscriptTurnDTO["speaker"], text: string): TranscriptTurnDTO => ({
  id: text,
  callId: "c1",
  speaker,
  text,
  latencyMs: null,
  createdAt: new Date().toISOString(),
});

const valid: CallAnalysis = {
  sentiment: "POSITIVE",
  objection: "SHIPPING_COST",
  intent: "WILL_PURCHASE",
  summary: "Customer accepted a discount.",
};

function analyzerWith(analyze: LlmClient["analyze"]) {
  const llm = { generate: vi.fn(), analyze: vi.fn(analyze) } as unknown as LlmClient;
  return { analyzer: createAnalyzer({ llm, env: { LLM_TIMEOUT_MS: 4321 } }), llm };
}

describe("createAnalyzer", () => {
  it("skips the LLM when the customer never spoke", async () => {
    const { analyzer, llm } = analyzerWith(async () => valid);
    const out = await analyzer.analyze([turn("AGENT", "Hi Rohan")]);
    expect(llm.analyze).not.toHaveBeenCalled();
    expect(out).toEqual({
      sentiment: "NEUTRAL",
      objection: "NONE",
      intent: "UNDECIDED",
      summary: "Customer did not speak.",
    });
  });

  it("treats an empty transcript the same way", async () => {
    const { analyzer, llm } = analyzerWith(async () => valid);
    expect((await analyzer.analyze([])).summary).toBe("Customer did not speak.");
    expect(llm.analyze).not.toHaveBeenCalled();
  });

  it("returns the failure default when the LLM errors", async () => {
    const { analyzer } = analyzerWith(async () => {
      throw new Error("down");
    });
    expect(await analyzer.analyze([turn("CUSTOMER", "hello")])).toEqual({
      sentiment: "NEUTRAL",
      objection: "OTHER",
      intent: "UNDECIDED",
      summary: "Analysis unavailable.",
    });
  });

  it("passes a valid analysis through", async () => {
    const { analyzer } = analyzerWith(async () => valid);
    expect(await analyzer.analyze([turn("CUSTOMER", "hello")])).toEqual(valid);
  });

  it("truncates a 300-character summary to 200", async () => {
    const { analyzer } = analyzerWith(async () => ({ ...valid, summary: "y".repeat(300) }));
    const out = await analyzer.analyze([turn("CUSTOMER", "hello")]);
    expect(out.summary).toHaveLength(200);
  });

  it("formats the transcript as Agent/Customer lines without system events and uses the timeout", async () => {
    const { analyzer, llm } = analyzerWith(async () => valid);
    await analyzer.analyze([
      turn("AGENT", "Hi Rohan"),
      turn("SYSTEM", "call connected"),
      turn("CUSTOMER", "shipping is high"),
      turn("AGENT", "I can help"),
    ]);
    expect(llm.analyze).toHaveBeenCalledWith({
      transcript: "Agent: Hi Rohan\nCustomer: shipping is high\nAgent: I can help",
      timeoutMs: 4321,
    });
  });
});
