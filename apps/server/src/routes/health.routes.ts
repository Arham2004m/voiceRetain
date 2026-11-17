import { Router } from "express";
import type { AppDeps } from "../app";

export function healthRoutes({ prisma, redis }: Pick<AppDeps, "prisma" | "redis">): Router {
  const router = Router();
  router.get("/health", async (_req, res) => {
    const [dbRes, redisRes] = await Promise.allSettled([prisma.$queryRaw`SELECT 1`, redis.ping()]);
    const status = {
      db: dbRes.status === "fulfilled" ? "up" : "down",
      redis: redisRes.status === "fulfilled" ? "up" : "down",
    } as const;
    const ok = status.db === "up" && status.redis === "up";
    res.status(ok ? 200 : 503).json({ ok, ...status });
  });
  return router;
}
