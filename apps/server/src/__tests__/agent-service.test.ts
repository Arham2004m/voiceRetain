import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { VOUCHER_REGEX } from "@voiceretain/shared";
import { createAgentService } from "../agent/agent.service";
import {
  LlmError,
  type GenerateRequest,
  type GenerateResult,
  type LlmClient,
} from "../agent/llm.types";
import { makeCart } from "./setup/fixtures";
import { createTestContext } from "./setup/test-app";

const ctx = createTestContext();
beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

/** Returns scripted answers in order; a step that is an Error is thrown instead. */
class ScriptedLlm implements LlmClient {
  requests: GenerateRequest[] = [];
  constructor(private steps: (GenerateResult | Error)[]) {}
  async generate(req: GenerateRequest): Promise<GenerateResult> {
    this.requests.push(structuredClone(req));
    const step = this.steps.shift();
    if (!step) throw new Error("script exhausted");
    if (step instanceof Error) throw step;
    return step;
  }
  async analyze(): Promise<never> {
    throw new Error("not used");
  }
}

const text = (t: string): GenerateResult => ({ text: t, functionCalls: [] });
const issue = (args: Record<string, unknown>): GenerateResult => ({
  functionCalls: [{ name: "issueDiscountCode", args, id: "f1" }],
});

async function liveCall(opts: Parameters<typeof makeCart>[1] = {}) {
  const { cartId, customerId } = await makeCart(ctx.prisma, { status: "ABANDONED", ...opts });
  const call = await ctx.prisma.callLog.create({
    data: { cartId, customerId: customerId!, status: "IN_PROGRESS", answeredAt: new Date() },
  });
  await ctx.prisma.transcriptTurn.create({
    data: { callId: call.id, speaker: "AGENT", text: "Hi Rohan, ..." },
  });
  return { cartId, callId: call.id };
}

const agentWith = (llm: LlmClient) =>
  createAgentService({ db: ctx.prisma, redis: ctx.redis, env: ctx.env, llm });

async function turn(
  llm: LlmClient,
  callId: string,
  customerText = "the shipping is too expensive",
  consecutiveFailures = 0,
) {
  // Mirrors CallService, which stores the customer's turn before asking the agent.
  await ctx.prisma.transcriptTurn.create({
    data: { callId, speaker: "CUSTOMER", text: customerText },
  });
  return agentWith(llm).runTurn({ callId, customerText, consecutiveFailures });
}

describe("guarded tool calls", () => {
  it("turns a model request for 40 percent into a 15 percent voucher and feeds the real result back", async () => {
    const { callId, cartId } = await liveCall();
    const llm = new ScriptedLlm([
      issue({ percent: 40, reason: "PRICE" }),
      text("Done, that is the best I can do."),
    ]);
    const result = await turn(llm, callId);

    expect(result.failed).toBe(false);
    expect(result.replyText).toBe("Done, that is the best I can do.");
    expect(result.voucher).toMatchObject({ percent: 15, cartId });
    expect(result.voucher?.code).toMatch(VOUCHER_REGEX);
    const row = await ctx.prisma.voucher.findUniqueOrThrow({
      where: { code: result.voucher!.code },
    });
    expect(row).toMatchObject({ percent: 15, callId });

    // The second request carries the model's call and the server's answer, not the model's 40.
    const second = llm.requests[1]!;
    const last = second.history[second.history.length - 1]!;
    expect(last.functionResponses?.[0]).toMatchObject({
      name: "issueDiscountCode",
      id: "f1",
      response: {
        ok: true,
        code: result.voucher!.code,
        percent: 15,
        alreadyIssued: false,
        expiresInHours: 24,
        spokenCode: expect.stringContaining(","),
      },
    });
  });

  it("returns the voucher card in the turn result", async () => {
    const { callId } = await liveCall();
    const result = await turn(
      new ScriptedLlm([
        issue({ percent: 10, reason: "SHIPPING_COST" }),
        text("Your code is ready."),
      ]),
      callId,
    );
    expect(result.voucher).toMatchObject({ percent: 10 });
    expect(result.endsCall).toBe(false);
  });

  it("reports a refusal to the model when the cart is too small", async () => {
    const { callId, cartId } = await liveCall();
    await ctx.prisma.cart.update({ where: { id: cartId }, data: { subtotalPaise: 10_000 } });
    const llm = new ScriptedLlm([
      issue({ percent: 10, reason: "PRICE" }),
      text("I'm sorry, I can't offer a discount on this order."),
    ]);
    const result = await turn(llm, callId);
    expect(result.voucher).toBeUndefined();
    const last = llm.requests[1]!.history.at(-1)!;
    expect(last.functionResponses?.[0]?.response).toEqual({ ok: false, reason: "CART_TOO_SMALL" });
  });

  it("refuses a nonsense percentage", async () => {
    const { callId } = await liveCall();
    const llm = new ScriptedLlm([issue({ percent: "lots", reason: "PRICE" }), text("Sorry.")]);
    await turn(llm, callId);
    const last = llm.requests[1]!.history.at(-1)!;
    expect(last.functionResponses?.[0]?.response).toEqual({ ok: false, reason: "INVALID_PERCENT" });
  });

  it("answers an unknown tool with UNKNOWN_TOOL and carries on", async () => {
    const { callId } = await liveCall();
    const llm = new ScriptedLlm([
      { functionCalls: [{ name: "refundEverything", args: {} }] },
      text("Let me help another way."),
    ]);
    const result = await turn(llm, callId);
    expect(result.replyText).toBe("Let me help another way.");
    const last = llm.requests[1]!.history.at(-1)!;
    expect(last.functionResponses?.[0]?.response).toEqual({ ok: false, reason: "UNKNOWN_TOOL" });
  });
});

describe("ending the call", () => {
  it("sets endsCall from the endCall tool and speaks the model's goodbye", async () => {
    const { callId } = await liveCall();
    const llm = new ScriptedLlm([
      {
        text: "Great, goodbye!",
        functionCalls: [{ name: "endCall", args: { reason: "WILL_PURCHASE" } }],
      },
    ]);
    const result = await turn(llm, callId, "okay I will buy");
    expect(result).toMatchObject({ replyText: "Great, goodbye!", endsCall: true, failed: false });
    expect(llm.requests).toHaveLength(1);
  });

  it("uses a fixed goodbye when endCall comes without text", async () => {
    const { callId } = await liveCall();
    const llm = new ScriptedLlm([
      { functionCalls: [{ name: "endCall", args: { reason: "DECLINED" } }] },
    ]);
    const result = await turn(llm, callId, "no thanks");
    expect(result.endsCall).toBe(true);
    expect(result.replyText).toMatch(/goodbye/i);
  });
});

describe("failure handling", () => {
  const fallback = "Sorry, I didn't catch that properly. Could you say that again?";

  it("answers a timeout with the fallback line and flags the failure", async () => {
    const { callId } = await liveCall();
    const result = await turn(new ScriptedLlm([new LlmError("TIMEOUT", "slow")]), callId);
    expect(result).toMatchObject({ replyText: fallback, failed: true, endsCall: false });
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("falls back on any unexpected error too", async () => {
    const { callId } = await liveCall();
    const result = await turn(new ScriptedLlm([new Error("kaboom")]), callId);
    expect(result).toMatchObject({ replyText: fallback, failed: true });
  });

  it("ends the call gracefully on the third consecutive failure", async () => {
    const { callId } = await liveCall();
    const result = await turn(
      new ScriptedLlm([new LlmError("RATE_LIMIT", "429")]),
      callId,
      "hello?",
      2,
    );
    expect(result).toMatchObject({
      replyText:
        "I'm having trouble on my end, so I'll let you go. Your cart is saved if you want to finish later. Goodbye!",
      endsCall: true,
      endReason: "LLM_FAILURE",
      failed: true,
    });
  });

  it("does not end the call on the second failure", async () => {
    const { callId } = await liveCall();
    const result = await turn(new ScriptedLlm([new LlmError("SERVER", "500")]), callId, "hi", 1);
    expect(result.endsCall).toBe(false);
  });

  it("stops after 3 model round-trips and answers with the fallback line", async () => {
    const { callId } = await liveCall();
    const llm = new ScriptedLlm([
      issue({ percent: 5, reason: "PRICE" }),
      issue({ percent: 5, reason: "PRICE" }),
      issue({ percent: 5, reason: "PRICE" }),
      text("never reached"),
    ]);
    const result = await turn(llm, callId);
    expect(llm.requests).toHaveLength(3);
    expect(result).toMatchObject({ replyText: fallback, failed: true });
  });

  it("treats an empty model answer as a failure", async () => {
    const { callId } = await liveCall();
    const result = await turn(new ScriptedLlm([{ functionCalls: [] }]), callId);
    expect(result).toMatchObject({ replyText: fallback, failed: true });
  });
});

describe("reply text and context", () => {
  it("strips markdown characters from the reply", async () => {
    const { callId } = await liveCall();
    const result = await turn(
      new ScriptedLlm([text("**Sure** — `10` percent  #deal for you")]),
      callId,
    );
    expect(result.replyText).toBe("Sure — 10 percent deal for you");
  });

  it("sends the system prompt and history with the customer's words exactly once", async () => {
    const { callId } = await liveCall();
    const llm = new ScriptedLlm([text("Which part?")]);
    await turn(llm, callId, "shipping");
    const req = llm.requests[0]!;
    expect(req.systemPrompt).toContain("- 1 × Wireless Earbuds Pro at ₹1,499");
    expect(req.systemPrompt).not.toContain("shipping\n");
    expect(req.history.map((m) => [m.role, m.text])).toEqual([
      ["user", "[The customer picked up the phone.]"],
      ["model", "Hi Rohan, ..."],
      ["user", "shipping"],
    ]);
    expect(req.tools.map((t) => t.name)).toEqual(["issueDiscountCode", "endCall"]);
    expect(req.timeoutMs).toBe(ctx.env.LLM_TIMEOUT_MS);
  });

  it("appends the customer's text when it is not yet in the transcript", async () => {
    const { callId } = await liveCall();
    const llm = new ScriptedLlm([text("Okay.")]);
    await agentWith(llm).runTurn({ callId, customerText: "hello there", consecutiveFailures: 0 });
    expect(llm.requests[0]!.history.at(-1)).toEqual({ role: "user", text: "hello there" });
  });
});
