import { Redis } from "ioredis";

export function createRedis(url: string, opts: { forBullMQ?: boolean } = {}): Redis {
  return new Redis(url, opts.forBullMQ ? { maxRetriesPerRequest: null } : {});
}
