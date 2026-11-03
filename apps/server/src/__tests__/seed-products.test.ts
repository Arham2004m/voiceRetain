import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createPrisma, resetTestDb } from "../db/prisma";
import { seedProducts } from "../seed/products";

const prisma = createPrisma(process.env.DATABASE_URL_TEST!);

beforeEach(async () => {
  await resetTestDb(prisma);
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe("seedProducts", () => {
  it("is idempotent and yields exactly 6 products", async () => {
    await seedProducts(prisma);
    await seedProducts(prisma);
    expect(await prisma.product.count()).toBe(6);
  });

  it("prices wireless-earbuds-pro at 149900 paise", async () => {
    await seedProducts(prisma);
    const p = await prisma.product.findUnique({ where: { slug: "wireless-earbuds-pro" } });
    expect(p?.pricePaise).toBe(149900);
  });
});
