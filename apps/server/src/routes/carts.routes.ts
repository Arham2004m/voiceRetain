import { Router } from "express";
import { CreateCartInput, ReplaceCartItemsInput } from "@voiceretain/shared";
import type { AppDeps } from "../app";
import { validate } from "../http/validate";
import { createCart, getCart, replaceItems } from "../services/cart.service";

export function cartsRoutes(deps: AppDeps): Router {
  const { prisma } = deps;
  const router = Router();

  router.post("/carts", validate(CreateCartInput, "body"), async (req, res) => {
    res.status(201).json(await createCart(prisma, req.body.items));
  });

  router.get("/carts/:id", async (req, res) => {
    res.json(await getCart(prisma, String(req.params.id)));
  });

  router.put("/carts/:id/items", validate(ReplaceCartItemsInput, "body"), async (req, res) => {
    res.json(await replaceItems(prisma, String(req.params.id), req.body.items));
  });

  return router;
}
