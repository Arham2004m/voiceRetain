import { computeTotals, toSpokenCode } from "@voiceretain/shared";
import type { Db } from "../db/prisma";
import type { CallOutcome, Objection, Sentiment } from "../generated/prisma/client";
import { generateVoucherCode } from "../vouchers/code-generator";
import { buildScript, type SeedKind, type SeedObjection } from "./fixtures/conversations";
import { SEED_NAMES, seedPhone } from "./fixtures/names";
import { createRng, randInt, shuffled } from "./rng";

const DAY = 86_400_000;
const HOUR = 3_600_000;
const IST_OFFSET = 5.5 * HOUR;

interface Spec {
  outcome: CallOutcome;
  kind: SeedKind | "none";
  objection: SeedObjection | "NONE";
  /** Discount the agent offered, if any. */
  percent?: 5 | 10 | 15;
}

/** PRD §13: 7 recovered, 4 accepted offer, 3 undecided, 3 declined, 3 no answer. */
const SPECS: Spec[] = [
  { outcome: "RECOVERED", kind: "recovered", objection: "SHIPPING_COST", percent: 10 },
  { outcome: "RECOVERED", kind: "recovered", objection: "SHIPPING_COST", percent: 5 },
  { outcome: "RECOVERED", kind: "recovered", objection: "PRICE", percent: 10 },
  { outcome: "RECOVERED", kind: "recovered", objection: "PRICE", percent: 15 },
  { outcome: "RECOVERED", kind: "recovered", objection: "PRICE", percent: 10 },
  { outcome: "RECOVERED", kind: "recovered", objection: "TRUST" },
  { outcome: "RECOVERED", kind: "recovered", objection: "TIMING" },
  { outcome: "ACCEPTED_OFFER", kind: "accepted", objection: "SHIPPING_COST", percent: 10 },
  { outcome: "ACCEPTED_OFFER", kind: "accepted", objection: "PRICE", percent: 10 },
  { outcome: "ACCEPTED_OFFER", kind: "accepted", objection: "PRICE", percent: 5 },
  { outcome: "ACCEPTED_OFFER", kind: "accepted", objection: "SHIPPING_COST", percent: 15 },
  { outcome: "UNDECIDED", kind: "undecided", objection: "TRUST" },
  { outcome: "UNDECIDED", kind: "undecided", objection: "TIMING" },
  { outcome: "UNDECIDED", kind: "undecided", objection: "CHANGED_MIND" },
  { outcome: "DECLINED", kind: "declined", objection: "PRICE", percent: 5 },
  { outcome: "DECLINED", kind: "declined", objection: "CHANGED_MIND" },
  { outcome: "DECLINED", kind: "declined", objection: "TRUST" },
  { outcome: "NO_ANSWER", kind: "none", objection: "NONE" },
  { outcome: "NO_ANSWER", kind: "none", objection: "NONE" },
  { outcome: "NO_ANSWER", kind: "none", objection: "NONE" },
];

const SENTIMENT: Record<CallOutcome, Sentiment> = {
  RECOVERED: "POSITIVE",
  ACCEPTED_OFFER: "POSITIVE",
  UNDECIDED: "NEUTRAL",
  DECLINED: "NEGATIVE",
  NO_ANSWER: "NEUTRAL",
  PENDING: "NEUTRAL",
};

/** Midnight at the start of the Indian calendar day that contains `moment`. */
const indiaMidnight = (moment: Date) =>
  Math.floor((moment.getTime() + IST_OFFSET) / DAY) * DAY - IST_OFFSET;

/** Removes every seeded row, children before parents (vouchers, orders and turns have no flag). */
export async function deleteSeedData(db: Db): Promise<void> {
  await db.$transaction([
    db.order.deleteMany({ where: { cart: { isSeed: true } } }),
    db.voucher.deleteMany({ where: { cart: { isSeed: true } } }),
    db.transcriptTurn.deleteMany({ where: { call: { isSeed: true } } }),
    db.callLog.deleteMany({ where: { isSeed: true } }),
    db.cartItem.deleteMany({ where: { cart: { isSeed: true } } }),
    db.cart.deleteMany({ where: { isSeed: true } }),
    db.customer.deleteMany({ where: { isSeed: true } }),
  ]);
}

export interface SeedHistoryOptions {
  /** The moment the history ends at; defaults to now. */
  now?: Date;
  rngSeed?: number;
}

/**
 * Twenty calls over the last seven days, so the dashboard has something to show before the first
 * live demo. Deterministic for a given `now` and `rngSeed`, and safe to run repeatedly: it
 * replaces its own earlier rows and never touches anything that is not flagged `isSeed`.
 */
export async function seedHistory(db: Db, opts: SeedHistoryOptions = {}): Promise<void> {
  const now = opts.now ?? new Date();
  const rng = createRng(opts.rngSeed ?? 20261117);

  // Carts are built from what is actually on sale; prefer prices a discount can apply to.
  const onSale = await db.product.findMany({ where: { active: true }, orderBy: { slug: "asc" } });
  if (onSale.length === 0) throw new Error("Cannot seed history: there are no products on sale");
  const sensible = onSale.filter((p) => p.pricePaise >= 60_000 && p.pricePaise <= 3_000_000);
  const pool = sensible.length > 0 ? sensible : onSale;

  const order = shuffled(SPECS, rng);
  // Recovered calls get one day each, so the revenue chart shows a week of activity.
  let recoveredDay = 0;
  let otherDay = 1;
  const usedCodes = new Set<string>();

  await deleteSeedData(db);

  await db.$transaction(
    async (tx) => {
      for (let i = 0; i < order.length; i++) {
        const spec = order[i]!;
        const name = SEED_NAMES[i]!;

        const day = spec.outcome === "RECOVERED" ? recoveredDay++ : (otherDay += 3) % 7;
        const startedAt = new Date(
          day === 0
            ? now.getTime() - (20 * 60_000 + Math.floor(rng() * 3 * HOUR))
            : indiaMidnight(now) - day * DAY + 8 * HOUR + Math.floor(rng() * 13 * HOUR),
        );

        // One or two different products, picked from the pool.
        const first1 = pool[Math.floor(rng() * pool.length)]!;
        const picked = [first1];
        if (rng() < 0.4 && pool.length > 1) {
          const second = pool[Math.floor(rng() * pool.length)]!;
          if (second.id !== first1.id) picked.push(second);
        }
        const items = picked.map((p) => ({
          product: p,
          quantity: 1 + (rng() < 0.2 ? 1 : 0),
        }));
        const subtotalPaise = items.reduce((s, i) => s + i.quantity * i.product.pricePaise, 0);

        const customer = await tx.customer.create({
          data: {
            name,
            phone: seedPhone(i),
            consentToCall: true,
            isSeed: true,
            createdAt: new Date(startedAt.getTime() - 3 * 60_000),
          },
        });
        const cart = await tx.cart.create({
          data: {
            customerId: customer.id,
            status: spec.outcome === "RECOVERED" ? "RECOVERED" : "ABANDONED",
            subtotalPaise,
            checkoutStartedAt: new Date(startedAt.getTime() - 30_000),
            abandonedAt: startedAt,
            isSeed: true,
            createdAt: new Date(startedAt.getTime() - 3 * 60_000),
            items: {
              create: items.map((i) => ({
                productId: i.product.id,
                quantity: i.quantity,
                unitPricePaise: i.product.pricePaise,
              })),
            },
          },
        });

        if (spec.outcome === "NO_ANSWER") {
          await tx.callLog.create({
            data: {
              cartId: cart.id,
              customerId: customer.id,
              status: "MISSED",
              outcome: "NO_ANSWER",
              sentiment: "NEUTRAL",
              objection: "NONE",
              summary: "Customer did not speak.",
              startedAt,
              endedAt: new Date(startedAt.getTime() + 30_000),
              isSeed: true,
            },
          });
          continue;
        }

        // A code, if one is offered, with the exact spoken form the agent would read out.
        let code: string | undefined;
        if (spec.percent) {
          do {
            code = generateVoucherCode((max) => Math.floor(rng() * max));
          } while (usedCodes.has(code));
          usedCodes.add(code);
        }
        const script = buildScript(spec.objection as SeedObjection, spec.kind as SeedKind, {
          customerName: name,
          items: items.map((i) => i.product.name),
          offer:
            code && spec.percent
              ? { percent: spec.percent, spokenCode: toSpokenCode(code) }
              : undefined,
        });

        const answeredAt = new Date(startedAt.getTime() + randInt(rng, 8_000, 20_000));
        let clock = answeredAt.getTime();
        const turns = script.lines.map((line, n) => {
          if (n > 0) clock += randInt(rng, 5_000, 18_000);
          return {
            speaker: line.speaker,
            text: line.text,
            // The opening line is templated, not generated, so it has no model latency.
            latencyMs: line.speaker === "AGENT" && n > 0 ? randInt(rng, 400, 2500) : null,
            createdAt: new Date(clock),
          };
        });
        const endedAt = new Date(clock + randInt(rng, 3_000, 10_000));
        const latencies = turns.filter((t) => t.latencyMs !== null).map((t) => t.latencyMs!);
        const avgLatencyMs = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);

        const call = await tx.callLog.create({
          data: {
            cartId: cart.id,
            customerId: customer.id,
            status: "ENDED",
            outcome: spec.outcome,
            sentiment: SENTIMENT[spec.outcome],
            objection: spec.objection as Objection,
            summary: script.summary.slice(0, 200),
            endReason: script.endedBy === "AGENT" ? "AGENT_ENDED" : "CUSTOMER_HANGUP",
            startedAt,
            answeredAt,
            endedAt,
            durationSec: Math.round((endedAt.getTime() - answeredAt.getTime()) / 1000),
            avgLatencyMs,
            isSeed: true,
            turns: { create: turns },
          },
        });

        let voucherId: string | undefined;
        if (code && spec.percent) {
          const offeredAt = turns.find(
            (t) => t.speaker === "AGENT" && t.text.includes("your code is"),
          )!.createdAt;
          const expiresAt = new Date(offeredAt.getTime() + 24 * HOUR);
          const recovered = spec.outcome === "RECOVERED";
          const voucher = await tx.voucher.create({
            data: {
              code,
              percent: spec.percent,
              status: recovered ? "REDEEMED" : expiresAt <= now ? "EXPIRED" : "ACTIVE",
              cartId: cart.id,
              callId: call.id,
              expiresAt,
              createdAt: offeredAt,
              redeemedAt: recovered ? new Date(endedAt.getTime() + 2 * 60_000) : null,
            },
          });
          voucherId = voucher.id;
        }

        if (spec.outcome === "RECOVERED") {
          const totals = computeTotals(subtotalPaise, spec.percent ?? 0);
          const orderedAt = new Date(endedAt.getTime() + randInt(rng, 2, 10) * 60_000);
          await tx.order.create({
            data: {
              cartId: cart.id,
              voucherId: voucherId ?? null,
              subtotalPaise: totals.subtotalPaise,
              discountPaise: totals.discountPaise,
              totalPaise: totals.totalPaise,
              createdAt: orderedAt,
            },
          });
          await tx.cart.update({ where: { id: cart.id }, data: { completedAt: orderedAt } });
          await tx.customer.update({
            where: { id: customer.id },
            data: { lifetimeValuePaise: totals.totalPaise },
          });
        }
      }
    },
    { timeout: 60_000, maxWait: 10_000 },
  );
}
