import type { Redis } from "ioredis";

const VERSION_KEY = "search:version";

/** Called on every write to customers, calls and vouchers; invalidates versioned cache keys. */
export async function bumpCacheVersion(redis: Redis): Promise<void> {
  await redis.incr(VERSION_KEY);
}

export async function getCacheVersion(redis: Redis): Promise<number> {
  const raw = await redis.get(VERSION_KEY);
  return raw === null ? 0 : Number(raw) || 0;
}
