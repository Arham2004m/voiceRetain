import { Router } from "express";
import type { AppDeps } from "../app";
import { listProducts } from "../services/cart.service";

export function productsRoutes({ prisma }: Pick<AppDeps, "prisma">): Router {
  const router = Router();
  router.get("/products", async (_req, res) => {
    res.json(await listProducts(prisma));
  });
  return router;
}
