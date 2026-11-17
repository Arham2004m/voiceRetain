import type { Redis } from "ioredis";
import type { Db } from "../db/prisma";
import { logger } from "../lib/logger";
import { getMetrics } from "../services/metrics.service";
import type { Emitter } from "./emitter";

/**
 * Calls, orders and vouchers all ask for a metrics update after they change something. Many
 * changes in a burst become a single `dashboard:metrics` emit, at most `debounceMs` later.
 */
export function createMetricsBroadcaster(deps: {
  db: Db;
  redis: Redis;
  emitter: Emitter;
  debounceMs?: number;
}): { schedule(): void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    schedule() {
      if (timer) return;
      timer = setTimeout(async () => {
        timer = undefined;
        try {
          deps.emitter.toDashboard("dashboard:metrics", await getMetrics(deps));
        } catch (err) {
          logger.error({ err }, "could not broadcast dashboard metrics");
        }
      }, deps.debounceMs ?? 1000);
    },
  };
}
