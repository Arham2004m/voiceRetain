import express from "express";
import helmet from "helmet";
import cors from "cors";
import type { Env } from "./config/env";
import { errorHandler, notFoundHandler } from "./http/errors";
import { healthRoutes } from "./routes/health.routes";

export interface AppDeps {
  /** Minimal database handle for now; Stage 2 adds the Prisma client alongside it. */
  db: { ping(): Promise<void> };
  redis: { ping(): Promise<unknown> };
  env: Env;
}

export function createApp(deps: AppDeps): express.Express {
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: deps.env.WEB_ORIGIN }));
  app.use(express.json({ limit: "100kb" }));
  app.use("/api", healthRoutes(deps));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
