import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Redis } from "ioredis";
import { Worker } from "bullmq";
import { createRedis } from "../lib/redis";
import {
  cancelAbandonmentCheck,
  createAbandonmentQueue,
  runAbandonmentCheckNow,
  scheduleAbandonmentCheck,
  type AbandonmentQueue,
} from "../queue/abandonment.queue";
import { getAbandonDelayMs, setAbandonDelayMs } from "../config/runtime-config";
import { TEST_QUEUE_PREFIX, testEnv, testRedisUrl } from "./setup/test-env";

let redis: Redis;
let queue: AbandonmentQueue;

beforeEach(async () => {
  redis = createRedis(testRedisUrl());
  await redis.flushdb();
  queue = createAbandonmentQueue(redis, TEST_QUEUE_PREFIX);
  await queue.obliterate({ force: true });
});
afterEach(async () => {
  await queue.obliterate({ force: true });
  await queue.close();
});
afterAll(() => {
  redis?.disconnect();
});

describe("scheduleAbandonmentCheck", () => {
  it("is idempotent: scheduling twice yields one delayed job with id abandon-c1", async () => {
    const first = await scheduleAbandonmentCheck(queue, "c1", 60_000);
    const second = await scheduleAbandonmentCheck(queue, "c1", 60_000);
    expect(first).toEqual({ scheduled: true });
    expect(second).toEqual({ scheduled: false });
    const delayed = await queue.getDelayed();
    expect(delayed).toHaveLength(1);
    expect(delayed[0]?.id).toBe("abandon-c1");
  });

  it("reschedules after the previous job completed", async () => {
    const connection = createRedis(testRedisUrl(), { forBullMQ: true });
    const worker = new Worker("abandonment", async () => undefined, {
      connection,
      prefix: TEST_QUEUE_PREFIX,
    });
    const completed = new Promise<void>((resolve) => worker.on("completed", () => resolve()));
    await scheduleAbandonmentCheck(queue, "c2", 0);
    await completed;
    await worker.close();
    connection.disconnect();
    // The finished job is still stored under abandon-c2 (removeOnComplete keeps 1000).
    expect(await queue.getJob("abandon-c2")).toBeTruthy();

    const result = await scheduleAbandonmentCheck(queue, "c2", 60_000);
    expect(result.scheduled).toBe(true);
    expect(await queue.getDelayed()).toHaveLength(1);
  });
});

describe("cancelAbandonmentCheck", () => {
  it("removes a delayed job", async () => {
    await scheduleAbandonmentCheck(queue, "c1", 60_000);
    expect(await cancelAbandonmentCheck(queue, "c1")).toBe(true);
    expect(await queue.getDelayed()).toHaveLength(0);
  });

  it("returns false when absent", async () => {
    expect(await cancelAbandonmentCheck(queue, "nope")).toBe(false);
  });
});

describe("runAbandonmentCheckNow", () => {
  it("replaces a delayed job with an immediate one", async () => {
    await scheduleAbandonmentCheck(queue, "c1", 60_000);
    await runAbandonmentCheckNow(queue, "c1");
    expect(await queue.getDelayed()).toHaveLength(0);
    const waiting = await queue.getWaiting();
    expect(waiting).toHaveLength(1);
    expect(waiting[0]?.id).toBe("abandon-c1");
  });
});

describe("runtime config", () => {
  it("falls back to env and honours the redis override", async () => {
    const env = testEnv();
    expect(await getAbandonDelayMs(redis, env)).toBe(env.ABANDON_DELAY_MS);
    await setAbandonDelayMs(redis, 12_345);
    expect(await getAbandonDelayMs(redis, env)).toBe(12_345);
  });
});
