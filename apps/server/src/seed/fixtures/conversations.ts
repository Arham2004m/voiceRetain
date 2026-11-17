import { buildGreeting } from "../../calls/greeting";

export type SeedObjection = "SHIPPING_COST" | "PRICE" | "TRUST" | "TIMING" | "CHANGED_MIND";
export type SeedKind = "recovered" | "accepted" | "undecided" | "declined";

export interface ScriptLine {
  speaker: "AGENT" | "CUSTOMER";
  text: string;
}

export interface ScriptContext {
  customerName: string;
  items: string[];
  /** Present when the agent offered a code on this call. */
  offer?: { percent: number; spokenCode: string };
}

export interface Script {
  lines: ScriptLine[];
  /** Who ended it: the agent's goodbye, or the customer hanging up. */
  endedBy: "AGENT" | "CUSTOMER";
  summary: string;
}

const GOODBYE_BUY = "Wonderful! Just use the link on your screen to finish. Goodbye!";
const GOODBYE_NO = "No problem at all. Have a great day!";
const GOODBYE_SAVED = "Of course. Your cart is saved if you change your mind. Goodbye!";

const A = (text: string): ScriptLine => ({ speaker: "AGENT", text });
const C = (text: string): ScriptLine => ({ speaker: "CUSTOMER", text });

/**
 * Six conversation shapes (shipping, price, trust, timing, changed mind, and the call nobody
 * answers, which has no lines at all). Wording follows what the agent really says and never
 * promises more than the real agent could.
 */
export function buildScript(objection: SeedObjection, kind: SeedKind, ctx: ScriptContext): Script {
  const greeting = A(
    buildGreeting({ customerName: ctx.customerName, items: ctx.items.map((name) => ({ name })) }),
  );
  const { offer } = ctx;
  const offerLine = (lead: string) =>
    A(
      `${lead} I can give you ${offer?.percent} percent off right now — your code is ${offer?.spokenCode}.`,
    );

  if (objection === "SHIPPING_COST" || objection === "PRICE") {
    const shipping = objection === "SHIPPING_COST";
    const complaint = shipping
      ? "The shipping charge was too much for me."
      : "Honestly it is a bit expensive for me.";
    const lead = shipping ? "I understand, shipping adds up." : "I hear you.";
    const what = shipping ? "shipping cost" : "price";
    const percent = offer?.percent ?? 0;

    if (kind === "declined") {
      return {
        lines: [
          greeting,
          C(complaint),
          offerLine(lead),
          C("Still too much for me, no thanks."),
          A(GOODBYE_NO),
        ],
        endedBy: "AGENT",
        summary: `Customer raised ${what}, was offered ${percent}% off and still declined.`,
      };
    }
    if (kind === "recovered") {
      return {
        lines: [
          greeting,
          C(complaint),
          offerLine(lead),
          C("Okay, that works. I will order now."),
          A(GOODBYE_BUY),
        ],
        endedBy: "AGENT",
        summary: `Customer raised ${what}, accepted a ${percent}% code and placed the order.`,
      };
    }
    return {
      lines: [greeting, C(complaint), offerLine(lead), C("That helps. Let me think about it.")],
      endedBy: "CUSTOMER",
      summary: `Customer raised ${what} and was interested in the ${percent}% code but has not ordered yet.`,
    };
  }

  if (objection === "TRUST") {
    const concern = "I was not sure about ordering from a store I do not know.";
    const ask = A("That is a fair concern. Is there anything about your cart I can clarify?");
    if (kind === "recovered") {
      return {
        lines: [
          greeting,
          C(concern),
          ask,
          C("No, that is enough. I will place the order."),
          A(GOODBYE_BUY),
        ],
        endedBy: "AGENT",
        summary: "Customer was unsure about a new store, felt reassured and placed the order.",
      };
    }
    if (kind === "declined") {
      return {
        lines: [greeting, C(concern), ask, C("No, I would rather not."), A(GOODBYE_NO)],
        endedBy: "AGENT",
        summary: "Customer did not trust a new store enough to order and declined.",
      };
    }
    return {
      lines: [greeting, C(concern), ask, C("I will think about it."), A(GOODBYE_SAVED)],
      endedBy: "AGENT",
      summary: "Customer was unsure about a new store and wants time to decide.",
    };
  }

  if (objection === "TIMING") {
    const busy = "I got busy and forgot. I will do it later.";
    const nudge = A("No worries, your cart is waiting. Would you like to finish now?");
    if (kind === "recovered") {
      return {
        lines: [greeting, C(busy), nudge, C("Sure, give me a minute."), A(GOODBYE_BUY)],
        endedBy: "AGENT",
        summary: "Customer had simply run out of time and finished the order during the call.",
      };
    }
    return {
      lines: [greeting, C(busy), nudge, C("Maybe tomorrow."), A(GOODBYE_SAVED)],
      endedBy: "AGENT",
      summary: "Customer was busy and may come back later.",
    };
  }

  // CHANGED_MIND
  const changed = "I changed my mind, actually.";
  const gentle = A("Understood. Is there something that put you off?");
  if (kind === "declined") {
    return {
      lines: [greeting, C(changed), gentle, C("Not really. No, thanks."), A(GOODBYE_NO)],
      endedBy: "AGENT",
      summary: "Customer changed their mind and declined without giving a reason.",
    };
  }
  return {
    lines: [greeting, C(changed), gentle, C("Not really, I am just not sure."), A(GOODBYE_SAVED)],
    endedBy: "AGENT",
    summary: "Customer changed their mind and is not sure; the cart stays saved.",
  };
}
