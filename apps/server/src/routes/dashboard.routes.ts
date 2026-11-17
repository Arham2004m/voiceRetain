import { Router } from "express";
import type { AppDeps } from "../app";
import { getMetrics } from "../services/metrics.service";

export function dashboardRoutes({ prisma, redis }: Pick<AppDeps, "prisma" | "redis">): Router {
  const router = Router();
  router.get("/dashboard/metrics", async (_req, res) => {
    res.json(await getMetrics({ db: prisma, redis }));
  });
  return router;
}
