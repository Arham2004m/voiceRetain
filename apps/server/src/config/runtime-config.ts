import type { Redis } from "ioredis";
import type { Env } from "./env";

const ABANDON_DELAY_KEY = "config:abandonDelayMs";

export async function getAbandonDelayMs(redis: Redis, env: Pick<Env, "ABANDON_DELAY_MS">) {
  const raw = await redis.get(ABANDON_DELAY_KEY);
  const parsed = raw === null ? NaN : Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : env.ABANDON_DELAY_MS;
}

export async function setAbandonDelayMs(redis: Redis, ms: number): Promise<void> {
  await redis.set(ABANDON_DELAY_KEY, String(ms));
}
