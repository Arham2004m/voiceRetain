import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { createPrisma } from "../src/db/prisma";
import { DEFAULT_CATALOGUE_URL, syncCatalogue } from "../src/seed/catalogue";
import { seedHistory } from "../src/seed/history";

config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)), quiet: true });

const prisma = createPrisma(process.env.DATABASE_URL!);

try {
  const catalogue = await syncCatalogue(prisma, {
    url: process.env.CATALOGUE_URL ?? DEFAULT_CATALOGUE_URL,
    usdToInr: Number(process.env.CATALOGUE_USD_TO_INR ?? 85),
  });
  console.log("Catalogue:", catalogue);
  await seedHistory(prisma);
  console.log("History: 20 seeded calls over the last 7 days.");
} finally {
  await prisma.$disconnect();
}
