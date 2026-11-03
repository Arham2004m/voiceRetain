import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { createPrisma } from "../src/db/prisma";
import { seedProducts } from "../src/seed/products";

config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)), quiet: true });

const prisma = createPrisma(process.env.DATABASE_URL!);

try {
  await seedProducts(prisma);
  // seedHistory(prisma) is added in Stage 10.
  console.log("Seeded products.");
} finally {
  await prisma.$disconnect();
}
