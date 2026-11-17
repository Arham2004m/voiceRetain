import express from "express";
import helmet from "helmet";
import cors from "cors";
import type { Redis } from "ioredis";
import type { Env } from "./config/env";
import type { Db } from "./db/prisma";
import type { AbandonmentQueue } from "./queue/abandonment.queue";
import { errorHandler, notFoundHandler } from "./http/errors";
import type { Emitter } from "./realtime/emitter";
import { ordersRoutes } from "./routes/orders.routes";
import { dashboardRoutes } from "./routes/dashboard.routes";
import { callsRoutes } from "./routes/calls.routes";
import { searchRoutes } from "./routes/search.routes";
import { demoRoutes } from "./routes/demo.routes";
import type { DemoHooks } from "./services/demo.service";
import { healthRoutes } from "./routes/health.routes";
import { productsRoutes } from "./routes/products.routes";
import { cartsRoutes } from "./routes/carts.routes";
import { webhookRoutes } from "./routes/webhook.routes";
import { vouchersRoutes } from "./routes/vouchers.routes";

export interface AppDeps {
  prisma: Db;
  redis: Redis;
  queue: AbandonmentQueue;
  emitter: Emitter;
  /** Debounced dashboard metrics broadcaster (a no-op until Stage 9). */
  metrics: { schedule(): void };
  env: Env;
  /** Hooks for the demo routes (re-seeding after a reset, catalogue refresh). */
  demo?: DemoHooks;
}

export function createApp(deps: AppDeps): express.Express {
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: deps.env.WEB_ORIGIN }));
  app.use(express.json({ limit: "100kb" }));
  app.use("/api", healthRoutes(deps));
  app.use("/api", productsRoutes(deps));
  app.use("/api", cartsRoutes(deps));
  app.use("/api", webhookRoutes(deps));
  app.use("/api", vouchersRoutes(deps));
  app.use("/api", ordersRoutes(deps));
  app.use("/api", dashboardRoutes(deps));
  app.use("/api", callsRoutes(deps));
  app.use("/api", searchRoutes(deps));
  // These routes can wipe data, so they exist only in demo mode (PRD §10.4).
  if (deps.env.DEMO_MODE) app.use("/api", demoRoutes(deps));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
