import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createPrisma, resetTestDb } from "../db/prisma";

const url = process.env.DATABASE_URL_TEST!;
const prisma = createPrisma(url);

beforeEach(async () => {
  await resetTestDb(prisma);
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe("database", () => {
  it("creates and reads a customer and a product", async () => {
    await prisma.customer.create({ data: { name: "Rohan", phone: "9876543210" } });
    await prisma.product.create({
      data: { slug: "p", name: "P", description: "d", pricePaise: 100, imageUrl: "/p.svg" },
    });
    const c = await prisma.customer.findUnique({ where: { phone: "9876543210" } });
    expect(c?.name).toBe("Rohan");
    expect(await prisma.product.count()).toBe(1);
  });

  it("rejects duplicate phone with P2002", async () => {
    await prisma.customer.create({ data: { name: "A", phone: "9876543210" } });
    await expect(
      prisma.customer.create({ data: { name: "B", phone: "9876543210" } }),
    ).rejects.toMatchObject({ code: "P2002" });
  });
});
