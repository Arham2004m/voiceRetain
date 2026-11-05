import { Router } from "express";
import { z } from "zod";
import { PaginationQuery, ValidateVoucherInput } from "@voiceretain/shared";
import type { AppDeps } from "../app";
import { validate } from "../http/validate";
import { toVoucherDTO } from "../mappers/voucher.mapper";
import { quoteVoucher } from "../vouchers/voucher.service";

const ListVouchersQuery = PaginationQuery.extend({
  status: z.enum(["ACTIVE", "SUPERSEDED", "REDEEMED", "EXPIRED"]).optional(),
});

export function vouchersRoutes({ prisma }: Pick<AppDeps, "prisma">): Router {
  const router = Router();

  router.post("/vouchers/validate", validate(ValidateVoucherInput, "body"), async (req, res) => {
    res.json(await quoteVoucher(prisma, req.body.code, req.body.cartId));
  });

  router.get("/vouchers", validate(ListVouchersQuery, "query"), async (req, res) => {
    const { cursor, limit, status } = req.query as unknown as z.infer<typeof ListVouchersQuery>;
    const rows = await prisma.voucher.findMany({
      where: status ? { status } : {},
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, limit);
    res.json({
      items: page.map(toVoucherDTO),
      nextCursor: rows.length > limit ? (page[page.length - 1]?.id ?? null) : null,
    });
  });

  return router;
}
