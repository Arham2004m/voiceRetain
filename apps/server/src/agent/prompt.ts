import {
  AGENT_NAME,
  FREE_SHIPPING_THRESHOLD_PAISE,
  SHIPPING_FEE_PAISE,
  STORE_NAME,
  computeTotals,
  formatINR,
} from "@voiceretain/shared";
import type { Db } from "../db/prisma";
import type { ChatMessage } from "./llm.types";

export interface CallContext {
  callId: string;
  cartId: string;
  customerName: string;
  items: { name: string; quantity: number; unitPricePaise: number }[];
  subtotalPaise: number;
  /** MAX_DISCOUNT_PERCENT: what the server will actually grant at most. */
  maxDiscountPercent: number;
}

/**
 * The checkout name is text typed by the customer, so only a conservative first name makes it
 * into the system prompt. Anything else they say reaches the model as conversation content.
 */
function safeFirstName(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0] ?? "";
  const cleaned = first.replace(/[^\p{L}\p{M}'-]/gu, "").slice(0, 30);
  return cleaned || "the customer";
}

export function buildSystemPrompt(ctx: CallContext): string {
  const itemsList = ctx.items
    .map((i) => `- ${i.quantity} × ${i.name} at ${formatINR(i.unitPricePaise)}`)
    .join("\n");
  const { shippingPaise } = computeTotals(ctx.subtotalPaise, 0);
  const shipping =
    shippingPaise === 0
      ? "Shipping: free on this order."
      : `Shipping: ${formatINR(SHIPPING_FEE_PAISE)} (free at ${formatINR(FREE_SHIPPING_THRESHOLD_PAISE)} or above).`;
  const max = ctx.maxDiscountPercent;

  return `You are ${AGENT_NAME}, a friendly customer-care specialist calling from ${STORE_NAME}, an online store.
You are on a live voice call with ${safeFirstName(ctx.customerName)}, who started checkout but did not finish.

Their cart:
${itemsList}
Cart subtotal: ${formatINR(ctx.subtotalPaise)}. ${shipping}

Your goals, in order:
1. Find out politely why they did not complete the order.
2. Address the concern honestly using only the facts above. Never invent prices, delivery dates, stock levels, or policies.
3. Only if the concern is about cost (price or shipping) or they are about to decline, you may offer a discount using the issueDiscountCode tool. Start with 5 or 10 percent. Offer ${max} percent only if they are still hesitant after a lower offer. You cannot offer more than ${max} percent under any circumstances — if asked, say that ${max} percent is the best you can do.
4. Never say a discount amount or code out loud unless the issueDiscountCode tool returned it. Read the code exactly as the tool's spokenCode gives it.
5. When the conversation is finished (they will complete the order, they decline, or they ask to end the call), say a short goodbye and call the endCall tool.

Style rules: this is a voice call. Reply in at most 2 short sentences, plain spoken English, no lists, no emojis, no markdown. Do not repeat the greeting. If the customer is rude or off-topic, stay polite and steer back to their order once, then offer to end the call.`;
}

export async function buildCallContext(
  db: Db,
  callId: string,
  opts: { maxDiscountPercent: number },
): Promise<CallContext> {
  const call = await db.callLog.findUniqueOrThrow({
    where: { id: callId },
    include: {
      customer: true,
      cart: { include: { items: { include: { product: true }, orderBy: { id: "asc" } } } },
    },
  });
  return {
    callId,
    cartId: call.cartId,
    customerName: call.customer.name,
    items: call.cart.items.map((i) => ({
      name: i.product.name,
      quantity: i.quantity,
      unitPricePaise: i.unitPricePaise,
    })),
    subtotalPaise: call.cart.subtotalPaise,
    maxDiscountPercent: opts.maxDiscountPercent,
  };
}

const PICKED_UP = "[The customer picked up the phone.]";

/** AGENT → model, CUSTOMER → user, SYSTEM skipped; same-side neighbours are merged. */
export function historyFromTurns(
  turns: { speaker: "AGENT" | "CUSTOMER" | "SYSTEM"; text: string }[],
): ChatMessage[] {
  const history: ChatMessage[] = [];
  for (const turn of turns) {
    if (turn.speaker === "SYSTEM") continue;
    const role = turn.speaker === "AGENT" ? "model" : "user";
    const last = history[history.length - 1];
    if (last && last.role === role) {
      last.text = `${last.text ?? ""} ${turn.text}`;
    } else {
      history.push({ role, text: turn.text });
    }
  }
  // Models expect a conversation to open with the user, but the greeting is spoken first.
  if (history[0]?.role === "model") history.unshift({ role: "user", text: PICKED_UP });
  return history;
}
