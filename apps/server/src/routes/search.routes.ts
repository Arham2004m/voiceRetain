import { Router } from "express";
import { SearchQuery } from "@voiceretain/shared";
import type { AppDeps } from "../app";
import { validate } from "../http/validate";
import { search } from "../services/search.service";

export function searchRoutes({ prisma, redis }: Pick<AppDeps, "prisma" | "redis">): Router {
  const router = Router();
  router.get("/search", validate(SearchQuery, "query"), async (req, res) => {
    res.json(await search({ db: prisma, redis }, (req.query as { q: string }).q));
  });
  return router;
}
