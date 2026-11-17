import type { Redis } from "ioredis";
import type { Env } from "../config/env";
import { getAbandonDelayMs, setAbandonDelayMs } from "../config/runtime-config";
import type { Db } from "../db/prisma";
import { runAbandonmentCheckNow, type AbandonmentQueue } from "../queue/abandonment.queue";
import { syncCatalogue, type SyncResult } from "../seed/catalogue";
import { bumpCacheVersion } from "./cache";

export interface DemoHooks {
  /** Rebuilds the seeded history after a reset (added in Stage 10). */
  reseed?: () => Promise<void>;
  /** Overridable in tests; defaults to the real catalogue sync. */
  syncCatalogue?: () => Promise<SyncResult>;
}

export interface DemoDeps {
  prisma: Db;
  redis: Redis;
  queue: AbandonmentQueue;
  env: Env;
  metrics: { schedule(): void };
  demo?: DemoHooks;
}

export async function getDemoConfig({ redis, env }: Pick<DemoDeps, "redis" | "env">) {
  return { abandonDelayMs: await getAbandonDelayMs(redis, env), mockLlm: env.MOCK_LLM };
}

export async function updateDemoConfig(
  deps: Pick<DemoDeps, "redis" | "env">,
  input: { abandonDelayMs: number },
) {
  await setAbandonDelayMs(deps.redis, input.abandonDelayMs);
  return getDemoConfig(deps);
}

/** Rings the newest customer who started checkout and agreed to a call, without waiting. */
export async function triggerLatest({
  prisma,
  queue,
}: Pick<DemoDeps, "prisma" | "queue">): Promise<{ cartId: string } | null> {
  const cart = await prisma.cart.findFirst({
    where: { status: "CHECKOUT_STARTED", customer: { consentToCall: true } },
    orderBy: [{ checkoutStartedAt: "desc" }, { createdAt: "desc" }],
    select: { id: true },
  });
  if (!cart) return null;
  await runAbandonmentCheckNow(queue, cart.id);
  return { cartId: cart.id };
}

async function deleteKeys(redis: Redis, pattern: string) {
  let cursor = "0";
  do {
    const [next, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 200);
    cursor = next;
    if (keys.length > 0) await redis.del(...keys);
  } while (cursor !== "0");
}

/**
 * Deletes what the demo created (everything not flagged `isSeed`), children before parents.
 * Vouchers, orders and transcript turns carry no flag of their own, so they go with their cart
 * or call. Products are the catalogue, not demo data, and stay.
 */
export async function resetDemo(deps: DemoDeps): Promise<void> {
  const { prisma, redis, queue } = deps;
  await prisma.$transaction([
    prisma.order.deleteMany({ where: { cart: { isSeed: false } } }),
    prisma.voucher.deleteMany({ where: { cart: { isSeed: false } } }),
    prisma.transcriptTurn.deleteMany({ where: { call: { isSeed: false } } }),
    prisma.callLog.deleteMany({ where: { isSeed: false } }),
    prisma.cartItem.deleteMany({ where: { cart: { isSeed: false } } }),
    prisma.cart.deleteMany({ where: { isSeed: false } }),
    prisma.customer.deleteMany({ where: { isSeed: false } }),
  ]);
  await queue.obliterate({ force: true });
  await deleteKeys(redis, "search:*");
  await deleteKeys(redis, "metrics:*");
  await bumpCacheVersion(redis);
  await deps.demo?.reseed?.();
  deps.metrics.schedule();
}

export function refreshCatalogue(
  deps: Pick<DemoDeps, "prisma" | "env" | "demo">,
): Promise<SyncResult> {
  if (deps.demo?.syncCatalogue) return deps.demo.syncCatalogue();
  return syncCatalogue(deps.prisma, {
    url: deps.env.CATALOGUE_URL,
    usdToInr: deps.env.CATALOGUE_USD_TO_INR,
  });
}
