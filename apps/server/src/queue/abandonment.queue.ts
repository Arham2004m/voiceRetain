import { Queue } from "bullmq";
import type { Redis } from "ioredis";

export const ABANDONMENT_QUEUE = "abandonment";

export type AbandonmentQueue = Queue<{ cartId: string }>;

export const abandonJobId = (cartId: string) => `abandon-${cartId}`;

export function createAbandonmentQueue(connection: Redis, prefix?: string): AbandonmentQueue {
  return new Queue<{ cartId: string }>(ABANDONMENT_QUEUE, {
    connection,
    ...(prefix ? { prefix } : {}),
    defaultJobOptions: {
      removeOnComplete: 1000,
      removeOnFail: 1000,
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
    },
  });
}

const PENDING_STATES = new Set(["delayed", "waiting", "active", "prioritized", "waiting-children"]);

/**
 * Schedules the abandonment check for a cart. A job that is still pending (or running) makes
 * this a no-op; a finished job keeps its id in Redis and BullMQ silently ignores `add` for an
 * existing id, so finished jobs are removed first.
 */
export async function scheduleAbandonmentCheck(
  queue: AbandonmentQueue,
  cartId: string,
  delayMs: number,
): Promise<{ scheduled: boolean }> {
  const jobId = abandonJobId(cartId);
  const existing = await queue.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (PENDING_STATES.has(state)) return { scheduled: false };
    await existing.remove();
  }
  await queue.add("check", { cartId }, { jobId, delay: delayMs });
  return { scheduled: true };
}

/** Removes a pending check. Returns true if a job was removed. */
export async function cancelAbandonmentCheck(
  queue: AbandonmentQueue,
  cartId: string,
): Promise<boolean> {
  const job = await queue.getJob(abandonJobId(cartId));
  if (!job) return false;
  try {
    await job.remove();
    return true;
  } catch {
    // An active job is locked by a worker; it re-checks the cart status itself.
    return false;
  }
}

/** Replaces any pending check with an immediate one (demo trigger). */
export async function runAbandonmentCheckNow(
  queue: AbandonmentQueue,
  cartId: string,
): Promise<void> {
  const jobId = abandonJobId(cartId);
  const existing = await queue.getJob(jobId);
  if (existing) {
    try {
      await existing.remove();
    } catch {
      return; // already running
    }
  }
  await queue.add("check", { cartId }, { jobId, delay: 0 });
}
