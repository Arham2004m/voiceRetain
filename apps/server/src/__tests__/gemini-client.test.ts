import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@google/genai";
import { GeminiLlmClient } from "../agent/gemini.client";
import { LlmError, type ChatMessage } from "../agent/llm.types";
import { TOOL_DECLARATIONS } from "../agent/tools";

type Params = {
  model: string;
  contents: unknown[];
  config: {
    systemInstruction?: unknown;
    tools?: { functionDeclarations: { name: string; parameters: unknown }[] }[];
    abortSignal?: AbortSignal;
    responseMimeType?: string;
    responseSchema?: unknown;
  };
};

const reply = (parts: unknown[]) => ({ candidates: [{ content: { role: "model", parts } }] });

function client(generateContent: (p: Params) => Promise<unknown>) {
  const fn = vi.fn(generateContent);
  const llm = new GeminiLlmClient({
    model: "gemini-test",
    retryDelayMs: 1,
    ai: { models: { generateContent: fn } } as never,
  });
  return { llm, fn };
}

const base = {
  systemPrompt: "You are Aria.",
  tools: TOOL_DECLARATIONS,
  timeoutMs: 1000,
};
const say = (text: string): ChatMessage[] => [{ role: "user", text }];

describe("GeminiLlmClient.generate", () => {
  it("sends the model id, system instruction, tools and mapped history", async () => {
    const { llm, fn } = client(async () => reply([{ text: "hello" }]));
    const modelTurn = {
      role: "model",
      parts: [
        {
          functionCall: { name: "issueDiscountCode", args: { percent: 10 }, id: "c1" },
          thoughtSignature: "sig-123",
        },
      ],
    };
    await llm.generate({
      ...base,
      history: [
        { role: "user", text: "shipping is high" },
        {
          role: "model",
          functionCalls: [{ name: "issueDiscountCode", args: { percent: 10 } }],
          raw: modelTurn,
        },
        {
          role: "user",
          functionResponses: [{ name: "issueDiscountCode", response: { ok: true }, id: "c1" }],
        },
      ],
    });

    const params = fn.mock.calls[0]![0];
    expect(params.model).toBe("gemini-test");
    expect(params.config.systemInstruction).toBe("You are Aria.");
    expect(params.config.tools?.[0]?.functionDeclarations.map((d) => d.name)).toEqual([
      "issueDiscountCode",
      "endCall",
    ]);
    expect(params.config.tools?.[0]?.functionDeclarations[0]?.parameters).toMatchObject({
      type: "OBJECT",
      required: ["percent", "reason"],
      properties: { percent: { type: "INTEGER" }, reason: { type: "STRING" } },
    });
    expect(params.contents[0]).toEqual({ role: "user", parts: [{ text: "shipping is high" }] });
    // The model's own turn is replayed untouched, so thought signatures survive.
    expect(params.contents[1]).toBe(modelTurn);
    expect(params.contents[2]).toEqual({
      role: "user",
      parts: [
        { functionResponse: { name: "issueDiscountCode", response: { ok: true }, id: "c1" } },
      ],
    });
  });

  it("returns text, function calls and the raw content", async () => {
    const parts = [
      { text: "thinking...", thought: true },
      { text: "Sure. " },
      { text: "One moment." },
      { functionCall: { name: "endCall", args: { reason: "DECLINED" }, id: "e1" } },
    ];
    const { llm } = client(async () => reply(parts));
    const out = await llm.generate({ ...base, history: say("bye") });
    expect(out.text).toBe("Sure. One moment.");
    expect(out.functionCalls).toEqual([
      { name: "endCall", args: { reason: "DECLINED" }, id: "e1" },
    ]);
    expect(out.raw).toEqual({ role: "model", parts });
  });

  it("maps an aborted request to LlmError TIMEOUT", async () => {
    const { llm } = client(
      (p) =>
        new Promise((_, reject) => {
          p.config.abortSignal?.addEventListener("abort", () =>
            reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
          );
        }),
    );
    const err = await llm.generate({ ...base, history: say("hi"), timeoutMs: 20 }).catch((e) => e);
    expect(err).toBeInstanceOf(LlmError);
    expect(err.kind).toBe("TIMEOUT");
  });

  it("retries once on 429 and then succeeds", async () => {
    let calls = 0;
    const { llm, fn } = client(async () => {
      if (++calls === 1) throw new ApiError({ message: "slow down", status: 429 });
      return reply([{ text: "ok" }]);
    });
    const out = await llm.generate({ ...base, history: say("hi") });
    expect(out.text).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("gives up after one retry on persistent 5xx with kind SERVER", async () => {
    const { llm, fn } = client(async () => {
      throw new ApiError({ message: "boom", status: 503 });
    });
    const err = await llm.generate({ ...base, history: say("hi") }).catch((e) => e);
    expect(err).toBeInstanceOf(LlmError);
    expect(err.kind).toBe("SERVER");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("reports RATE_LIMIT when 429 persists", async () => {
    const { llm } = client(async () => {
      throw new ApiError({ message: "quota", status: 429 });
    });
    const err = await llm.generate({ ...base, history: say("hi") }).catch((e) => e);
    expect(err.kind).toBe("RATE_LIMIT");
  });

  it("does not retry a 400", async () => {
    const { llm, fn } = client(async () => {
      throw new ApiError({ message: "bad", status: 400 });
    });
    const err = await llm.generate({ ...base, history: say("hi") }).catch((e) => e);
    expect(err.kind).toBe("BAD_RESPONSE");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("treats a response without candidates as BAD_RESPONSE", async () => {
    const { llm } = client(async () => ({ candidates: [] }));
    const err = await llm.generate({ ...base, history: say("hi") }).catch((e) => e);
    expect(err.kind).toBe("BAD_RESPONSE");
  });
});

describe("GeminiLlmClient.analyze", () => {
  const json = (v: unknown) => ({
    candidates: [{ content: { parts: [{ text: JSON.stringify(v) }] } }],
  });
  const valid = {
    sentiment: "POSITIVE",
    objection: "PRICE",
    intent: "WILL_PURCHASE",
    summary: "Customer accepted a discount.",
  };

  it("requests structured JSON and returns the parsed analysis", async () => {
    const { llm, fn } = client(async () => json(valid));
    const out = await llm.analyze({ transcript: "Agent: hi", timeoutMs: 1000 });
    expect(out).toEqual(valid);
    const params = fn.mock.calls[0]![0];
    expect(params.config.responseMimeType).toBe("application/json");
    expect(params.config.responseSchema).toMatchObject({ type: "OBJECT" });
  });

  it("truncates the summary to 200 characters", async () => {
    const { llm } = client(async () => json({ ...valid, summary: "x".repeat(300) }));
    const out = await llm.analyze({ transcript: "t", timeoutMs: 1000 });
    expect(out.summary).toHaveLength(200);
  });

  it("rejects an out-of-range enum value with BAD_RESPONSE", async () => {
    const { llm } = client(async () => json({ ...valid, sentiment: "ECSTATIC" }));
    const err = await llm.analyze({ transcript: "t", timeoutMs: 1000 }).catch((e) => e);
    expect(err).toBeInstanceOf(LlmError);
    expect(err.kind).toBe("BAD_RESPONSE");
  });

  it("rejects non-JSON text with BAD_RESPONSE", async () => {
    const { llm } = client(async () => reply([{ text: "not json" }]));
    const err = await llm.analyze({ transcript: "t", timeoutMs: 1000 }).catch((e) => e);
    expect(err.kind).toBe("BAD_RESPONSE");
  });
});
