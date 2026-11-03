import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

export type Db = PrismaClient;

export function createPrisma(url: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}

const TABLES = [
  "TranscriptTurn",
  "Order",
  "Voucher",
  "CallLog",
  "CartItem",
  "Cart",
  "Customer",
  "Product",
];

export async function resetTestDb(prisma: PrismaClient): Promise<void> {
  const list = TABLES.map((t) => `"${t}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}
