import { Router } from "express";
import { CartAbandonedWebhookInput } from "@voiceretain/shared";
import type { AppDeps } from "../app";
import { perMinuteLimiter } from "../http/rate-limit";
import { validate } from "../http/validate";
import { handleCartAbandonedWebhook } from "../services/checkout.service";

export function webhookRoutes(deps: AppDeps): Router {
  const router = Router();
  router.post(
    "/cart-abandoned",
    perMinuteLimiter(),
    validate(CartAbandonedWebhookInput, "body"),
    async (req, res) => {
      res.json(await handleCartAbandonedWebhook(deps, req.body));
    },
  );
  return router;
}
