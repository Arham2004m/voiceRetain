import { describe, expect, it } from "vitest";
import { MockLlmClient } from "../agent/mock.client";
import { TOOL_DECLARATIONS } from "../agent/tools";
import type { ChatMessage } from "../agent/llm.types";

const mock = (maxDiscountPercent = 15) => new MockLlmClient({ latencyMs: 0, maxDiscountPercent });
const say = (text: string): ChatMessage[] => [{ role: "user", text }];
const generate = (client: MockLlmClient, history: ChatMessage[]) =>
  client.generate({ systemPrompt: "", history, tools: TOOL_DECLARATIONS, timeoutMs: 1000 });

describe("MockLlmClient.generate", () => {
  it("offers 10 percent for a shipping complaint and speaks the returned code afterwards", async () => {
    const client = mock();
    const first = await generate(client, say("The shipping was too expensive"));
    expect(first.functionCalls).toEqual([
      { name: "issueDiscountCode", args: { percent: 10, reason: "SHIPPING_COST" } },
    ]);

    const history: ChatMessage[] = [
      ...say("The shipping was too expensive"),
      { role: "model", functionCalls: first.functionCalls },
      {
        role: "user",
        functionResponses: [
          {
            name: "issueDiscountCode",
            response: { ok: true, percent: 10, spokenCode: "V R, 8 K Q 2, X 7 M D" },
          },
        ],
      },
    ];
    const second = await generate(client, history);
    expect(second.functionCalls).toEqual([]);
    expect(second.text).toBe(
      "I understand, shipping adds up. I can give you 10 percent off right now — your code is V R, 8 K Q 2, X 7 M D.",
    );
  });

  it.each(["it is too expensive", "what a high price", "can you do cheaper", "that's costly"])(
    "treats %j as a price objection",
    async (text) => {
      const out = await generate(mock(), say(text));
      expect(out.functionCalls).toEqual([
        { name: "issueDiscountCode", args: { percent: 10, reason: "PRICE" } },
      ]);
    },
  );

  it("asks for the cap when the customer wants more than 15 percent", async () => {
    const client = mock();
    const first = await generate(client, say("give me 50%"));
    expect(first.functionCalls).toEqual([
      { name: "issueDiscountCode", args: { percent: 15, reason: "HESITATION" } },
    ]);
    const second = await generate(client, [
      ...say("give me 50%"),
      { role: "model", functionCalls: first.functionCalls },
      {
        role: "user",
        functionResponses: [
          { name: "issueDiscountCode", response: { ok: true, percent: 15, spokenCode: "x" } },
        ],
      },
    ]);
    expect(second.text).toBe(
      "15 percent is the best I can do, and I'm happy to apply that for you.",
    );
  });

  it("uses the configured cap instead of a hard-coded 15", async () => {
    const first = await generate(mock(10), say("make it 40 percent"));
    expect(first.functionCalls[0]?.args).toEqual({ percent: 10, reason: "HESITATION" });
  });

  it("does not treat 10% as a request for more than 15", async () => {
    const out = await generate(mock(), say("how about 10%"));
    expect(out.functionCalls).toEqual([]);
  });

  it("ends the call with DECLINED on a refusal", async () => {
    const out = await generate(mock(), say("no thanks bye"));
    expect(out.text).toBe("No problem at all. Have a great day!");
    expect(out.functionCalls).toEqual([{ name: "endCall", args: { reason: "DECLINED" } }]);
  });

  it("ends the call with WILL_PURCHASE on agreement", async () => {
    const out = await generate(mock(), say("okay I will buy"));
    expect(out.text).toBe("Wonderful! Just use the link on your screen to finish. Goodbye!");
    expect(out.functionCalls).toEqual([{ name: "endCall", args: { reason: "WILL_PURCHASE" } }]);
  });

  it("matches whole words only", async () => {
    const out = await generate(mock(), say("I took a book"));
    expect(out.functionCalls).toEqual([]);
    expect(out.text).toBe("Got it. Is it the price or the delivery that's holding you back?");
  });

  it("asks a clarifying question when nothing matches", async () => {
    const out = await generate(mock(), say("hmm let me think"));
    expect(out).toMatchObject({
      text: "Got it. Is it the price or the delivery that's holding you back?",
      functionCalls: [],
    });
  });

  it("apologises when the tool refused the discount", async () => {
    const out = await generate(mock(), [
      ...say("shipping is high"),
      { role: "model", functionCalls: [{ name: "issueDiscountCode", args: { percent: 10 } }] },
      {
        role: "user",
        functionResponses: [
          { name: "issueDiscountCode", response: { ok: false, reason: "CART_TOO_SMALL" } },
        ],
      },
    ]);
    expect(out.text).toMatch(/not able to offer a discount/);
    expect(out.functionCalls).toEqual([]);
  });

  it("repeats the existing code when it was already issued", async () => {
    const out = await generate(mock(), [
      ...say("shipping is high"),
      { role: "model", functionCalls: [{ name: "issueDiscountCode", args: { percent: 5 } }] },
      {
        role: "user",
        functionResponses: [
          {
            name: "issueDiscountCode",
            response: { ok: true, alreadyIssued: true, percent: 10, spokenCode: "A B" },
          },
        ],
      },
    ]);
    expect(out.text).toContain("10 percent");
    expect(out.text).toContain("A B");
  });
});

describe("MockLlmClient.analyze", () => {
  const transcript = (...lines: string[]) => lines.join("\n");

  it("reads a voucher conversation as WILL_PURCHASE with a shipping objection", async () => {
    const out = await mock().analyze({
      transcript: transcript(
        "Agent: Hi Rohan...",
        "Customer: the shipping was too expensive",
        "Agent: I understand, shipping adds up. I can give you 10 percent off right now — your code is V R.",
      ),
      timeoutMs: 1000,
    });
    expect(out).toMatchObject({
      intent: "WILL_PURCHASE",
      sentiment: "POSITIVE",
      objection: "SHIPPING_COST",
    });
    expect(out.summary.length).toBeLessThanOrEqual(200);
  });

  it("reads a refusal as DECLINED and NEGATIVE", async () => {
    const out = await mock().analyze({
      transcript: transcript(
        "Agent: Hi",
        "Customer: no thanks bye",
        "Agent: No problem at all. Have a great day!",
      ),
      timeoutMs: 1000,
    });
    expect(out).toMatchObject({ intent: "DECLINED", sentiment: "NEGATIVE" });
  });

  it("defaults to UNDECIDED and NEUTRAL", async () => {
    const out = await mock().analyze({
      transcript: transcript("Agent: Hi", "Customer: hmm"),
      timeoutMs: 1000,
    });
    expect(out).toMatchObject({ intent: "UNDECIDED", sentiment: "NEUTRAL", objection: "NONE" });
  });
});
