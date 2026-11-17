import { Router } from "express";
import { z } from "zod";
import { PaginationQuery } from "@voiceretain/shared";
import type { AppDeps } from "../app";
import { validate } from "../http/validate";
import { getCallDetail, listCalls } from "../services/calls-query.service";

const ListCallsQuery = PaginationQuery.extend({
  outcome: z
    .enum(["PENDING", "RECOVERED", "ACCEPTED_OFFER", "UNDECIDED", "DECLINED", "NO_ANSWER"])
    .optional(),
  sentiment: z.enum(["POSITIVE", "NEUTRAL", "NEGATIVE"]).optional(),
  customerId: z.string().min(1).optional(),
});

export function callsRoutes({ prisma }: Pick<AppDeps, "prisma">): Router {
  const router = Router();

  router.get("/calls", validate(ListCallsQuery, "query"), async (req, res) => {
    res.json(await listCalls(prisma, req.query as unknown as z.infer<typeof ListCallsQuery>));
  });

  router.get("/calls/:id", async (req, res) => {
    res.json(await getCallDetail(prisma, String(req.params.id)));
  });

  return router;
}
