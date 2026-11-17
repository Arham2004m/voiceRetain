import type { SearchResults } from "@voiceretain/shared";
import type { Redis } from "ioredis";
import type { Db } from "../db/prisma";
import { callInclude, toCallSummaryDTO } from "../mappers/call.mapper";
import { toVoucherDTO } from "../mappers/voucher.mapper";
import { getCacheVersion } from "./cache";

const PER_GROUP = 5;
const CACHE_TTL_SECONDS = 60;

/** Lowercase, trimmed, single-spaced: "  Rohan   MEHTA " and "rohan mehta" are one search. */
export const normalizeQuery = (q: string) => q.trim().toLowerCase().replace(/\s+/g, " ");

/** Makes `%`, `_` and `\` ordinary characters in a LIKE pattern. */
export const escapeLike = (q: string) => q.replace(/[\\%_]/g, "\\$&");

/**
 * Customers (name, phone), calls (summary) and vouchers (code), five of each. The term is escaped, so `%` and
 * `_` are plain characters and cannot be used to match everything. Results are cached
 * for 60 s under a key that carries the cache version, which every write to customers, calls and
 * vouchers bumps (PRD §10.3).
 */
export async function search(deps: { db: Db; redis: Redis }, q: string): Promise<SearchResults> {
  const { db, redis } = deps;
  const query = normalizeQuery(q);
  const key = `search:v${await getCacheVersion(redis)}:${query}`;
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached) as SearchResults;

  const contains = { contains: escapeLike(query), mode: "insensitive" as const };
  const [customers, calls, vouchers] = await Promise.all([
    db.customer.findMany({
      where: { OR: [{ name: contains }, { phone: contains }] },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: PER_GROUP,
      select: { id: true, name: true, phone: true },
    }),
    db.callLog.findMany({
      where: { summary: contains },
      include: callInclude,
      orderBy: [{ startedAt: "desc" }, { id: "desc" }],
      take: PER_GROUP,
    }),
    db.voucher.findMany({
      where: { code: contains },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: PER_GROUP,
    }),
  ]);

  const results: SearchResults = {
    customers,
    calls: calls.map(toCallSummaryDTO),
    vouchers: vouchers.map(toVoucherDTO),
  };
  await redis.set(key, JSON.stringify(results), "EX", CACHE_TTL_SECONDS);
  return results;
}
