import { Worker } from "bullmq";
import type { Redis } from "ioredis";
import type { Prisma } from "../generated/prisma/client";
import type { Db } from "../db/prisma";
import { logger } from "../lib/logger";
import { ABANDONMENT_QUEUE } from "./abandonment.queue";

export type AbandonmentResult =
  | "CALLED"
  | "SKIPPED_NOT_PENDING"
  | "SKIPPED_NO_CONSENT"
  | "SKIPPED_ACTIVE_CALL"
  | "SKIPPED_NOT_FOUND";

/**
 * Creates the RINGING call inside the caller's transaction. It may return a hook that runs
 * after the transaction commits (socket emits, ring timers) so nothing is emitted for a call
 * that was rolled back.
 */
export type StartCall = (
  cartId: string,
  tx: Prisma.TransactionClient,
) => Promise<(() => void | Promise<void>) | void>;

export interface AbandonmentDeps {
  db: Db;
  startCall: StartCall;
}

const isUniqueViolation = (err: unknown) =>
  typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";

export async function processAbandonmentCheck(
  cartId: string,
  deps: AbandonmentDeps,
): Promise<AbandonmentResult> {
  let afterCommit: (() => void | Promise<void>) | void;
  let result: AbandonmentResult;
  try {
    ({ result, afterCommit } = await deps.db.$transaction(async (tx) => {
      const cart = await tx.cart.findUnique({
        where: { id: cartId },
        include: { customer: true },
      });
      if (!cart) return { result: "SKIPPED_NOT_FOUND" as const };
      if (cart.status !== "CHECKOUT_STARTED") return { result: "SKIPPED_NOT_PENDING" as const };
      if (!cart.customer || !cart.customer.consentToCall) {
        return { result: "SKIPPED_NO_CONSENT" as const };
      }
      const active = await tx.callLog.count({
        where: { customerId: cart.customer.id, status: { in: ["RINGING", "IN_PROGRESS"] } },
      });
      if (active > 0) return { result: "SKIPPED_ACTIVE_CALL" as const };

      // Atomic claim: only one worker can move the cart out of CHECKOUT_STARTED.
      const claimed = await tx.cart.updateMany({
        where: { id: cartId, status: "CHECKOUT_STARTED" },
        data: { status: "ABANDONED", abandonedAt: new Date() },
      });
      if (claimed.count === 0) return { result: "SKIPPED_NOT_PENDING" as const };

      const hook = await deps.startCall(cartId, tx);
      return { result: "CALLED" as const, afterCommit: hook };
    }));
  } catch (err) {
    // The partial unique index (FR-3.7) rejected a second active call for the customer.
    if (isUniqueViolation(err)) return "SKIPPED_ACTIVE_CALL";
    throw err;
  }
  if (afterCommit) await afterCommit();
  return result;
}

export function startAbandonmentWorker(
  deps: AbandonmentDeps & { connection: Redis; prefix?: string },
): Worker<{ cartId: string }, AbandonmentResult> {
  const worker = new Worker<{ cartId: string }, AbandonmentResult>(
    ABANDONMENT_QUEUE,
    async (job) => {
      const result = await processAbandonmentCheck(job.data.cartId, deps);
      logger.info({ cartId: job.data.cartId, result }, `processAbandonmentCheck → ${result}`);
      return result;
    },
    {
      // The connection must be created with maxRetriesPerRequest: null (see createRedis).
      connection: deps.connection,
      concurrency: 5,
      ...(deps.prefix ? { prefix: deps.prefix } : {}),
    },
  );
  worker.on("failed", (job, err) =>
    logger.error({ err, cartId: job?.data.cartId }, "abandonment job failed"),
  );
  return worker;
}
