import { Router } from "express";
import type { AppDeps } from "../app";

export function healthRoutes({ db, redis }: Pick<AppDeps, "db" | "redis">): Router {
  const router = Router();
  router.get("/health", async (_req, res) => {
    const [dbRes, redisRes] = await Promise.allSettled([db.ping(), redis.ping()]);
    const status = {
      db: dbRes.status === "fulfilled" ? "up" : "down",
      redis: redisRes.status === "fulfilled" ? "up" : "down",
    } as const;
    const ok = status.db === "up" && status.redis === "up";
    res.status(ok ? 200 : 503).json({ ok, ...status });
  });
  return router;
}
