import { Router } from "express";
import type { AppDeps } from "../app";
import { getOrder } from "../services/order.service";

export function ordersRoutes({ prisma }: Pick<AppDeps, "prisma">): Router {
  const router = Router();
  router.get("/orders/:id", async (req, res) => {
    res.json(await getOrder(prisma, String(req.params.id)));
  });
  return router;
}
