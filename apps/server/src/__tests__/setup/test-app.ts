import type { Express } from "express";
import type { Redis } from "ioredis";
import { createApp } from "../../app";
import { createPrisma, resetTestDb, type Db } from "../../db/prisma";
import { createRedis } from "../../lib/redis";
import { createAbandonmentQueue, type AbandonmentQueue } from "../../queue/abandonment.queue";
import { createFakeEmitter } from "../../realtime/emitter";
import type { Env } from "../../config/env";
import { TEST_QUEUE_PREFIX, testEnv, testRedisUrl } from "./test-env";

export interface TestContext {
  prisma: Db;
  redis: Redis;
  queue: AbandonmentQueue;
  emitter: ReturnType<typeof createFakeEmitter>;
  metrics: { schedule(): void };
  env: Env;
  app: Express;
  /** Truncate the database, flush test redis, empty the queue and forget recorded emissions. */
  reset(): Promise<void>;
  close(): Promise<void>;
}

export function createTestContext(envOverrides: Partial<Env> = {}): TestContext {
  const env = testEnv(envOverrides);
  const prisma = createPrisma(env.DATABASE_URL);
  const redis = createRedis(testRedisUrl());
  const queue = createAbandonmentQueue(redis, TEST_QUEUE_PREFIX);
  const emitter = createFakeEmitter();
  const metrics = { schedule: () => undefined };
  return {
    prisma,
    redis,
    queue,
    emitter,
    metrics,
    env,
    app: createApp({ prisma, redis, queue, emitter, metrics, env }),
    async reset() {
      await resetTestDb(prisma);
      await redis.flushdb();
      await queue.obliterate({ force: true });
      emitter.emissions.length = 0;
    },
    async close() {
      await queue.obliterate({ force: true });
      await queue.close();
      await prisma.$disconnect();
      redis.disconnect();
    },
  };
}
