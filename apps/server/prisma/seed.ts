import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { createPrisma } from "../src/db/prisma";
import { DEFAULT_CATALOGUE_URL, syncCatalogue } from "../src/seed/catalogue";

config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)), quiet: true });

const prisma = createPrisma(process.env.DATABASE_URL!);

try {
  const result = await syncCatalogue(prisma, {
    url: process.env.CATALOGUE_URL ?? DEFAULT_CATALOGUE_URL,
    usdToInr: Number(process.env.CATALOGUE_USD_TO_INR ?? 85),
  });
  console.log("Catalogue:", result);
  // seedHistory(prisma) is added in Stage 10.
} finally {
  await prisma.$disconnect();
}
