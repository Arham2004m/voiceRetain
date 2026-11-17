import { Router } from "express";
import { DemoConfigInput } from "@voiceretain/shared";
import type { AppDeps } from "../app";
import { notFound } from "../http/errors";
import { validate } from "../http/validate";
import {
  getDemoConfig,
  refreshCatalogue,
  resetDemo,
  triggerLatest,
  updateDemoConfig,
} from "../services/demo.service";

/** Mounted only when DEMO_MODE is on: these routes can wipe data. */
export function demoRoutes(deps: AppDeps): Router {
  const router = Router();

  router.get("/demo/config", async (_req, res) => {
    res.json(await getDemoConfig(deps));
  });

  router.put("/demo/config", validate(DemoConfigInput, "body"), async (req, res) => {
    res.json(await updateDemoConfig(deps, req.body));
  });

  router.post("/demo/trigger-latest", async (_req, res) => {
    const result = await triggerLatest(deps);
    if (!result) throw notFound("No cart is waiting for a call");
    res.json(result);
  });

  router.post("/demo/reset", async (_req, res) => {
    await resetDemo(deps);
    res.json({ ok: true });
  });

  router.post("/demo/sync-catalogue", async (_req, res) => {
    res.json(await refreshCatalogue(deps));
  });

  return router;
}
