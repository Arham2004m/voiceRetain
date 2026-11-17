import { z } from "zod";
import type { Db } from "../db/prisma";
import { logger } from "../lib/logger";
import { seedProducts } from "./products";

export const DEFAULT_CATALOGUE_URL = "https://dummyjson.com/products";
/** Priced in the lakhs, which makes no sense in a cart-recovery demo. */
export const DEFAULT_EXCLUDED_CATEGORIES = ["vehicle", "motorcycle"];

const FIELDS = "id,title,description,category,price,thumbnail,images";

const DummyProductSchema = z.object({
  id: z.number().int(),
  title: z.string().trim().min(1),
  description: z.string().default(""),
  category: z.string().trim().min(1),
  price: z.number().positive(),
  thumbnail: z.string().url().optional(),
  images: z.array(z.string().url()).optional(),
});
export type DummyProduct = z.input<typeof DummyProductSchema>;

export interface CatalogueOptions {
  url?: string;
  /** Rupees per US dollar: the catalogue is priced in dollars, the store sells in rupees. */
  usdToInr: number;
  excludeCategories?: string[];
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

export type SyncResult =
  | { source: "dummyjson"; synced: number; skipped: number; retired: number }
  | { source: "kept" | "fallback"; synced: number; error: string };

export function toProductRow(p: DummyProduct, usdToInr: number) {
  const rupees = Math.round(p.price * usdToInr);
  return {
    slug: `dj-${p.id}`,
    name: p.title,
    description: p.description ?? "",
    category: p.category,
    // Whole rupees, and never free.
    pricePaise: Math.max(1, rupees) * 100,
    imageUrl: p.images?.[0] ?? p.thumbnail ?? "",
  };
}

async function fetchProducts(opts: CatalogueOptions): Promise<unknown[]> {
  const fetchFn = opts.fetchFn ?? fetch;
  const url = `${opts.url ?? DEFAULT_CATALOGUE_URL}?limit=0&select=${FIELDS}`;
  const res = await fetchFn(url, { signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000) });
  if (!res.ok) throw new Error(`Catalogue responded ${res.status}`);
  const body = (await res.json()) as { products?: unknown };
  if (!Array.isArray(body.products)) throw new Error("Catalogue response had no products list");
  return body.products;
}

/**
 * Loads the store's shelves from dummyjson into the Product table (carts, vouchers and orders
 * need stable server-side records). Safe to run repeatedly. If the API cannot be reached the
 * existing shelves are kept, and if there are none the six built-in products are loaded, so the
 * store is never empty and the demo still works offline.
 */
export async function syncCatalogue(db: Db, opts: CatalogueOptions): Promise<SyncResult> {
  if (!Number.isFinite(opts.usdToInr) || opts.usdToInr <= 0) {
    throw new Error("Invalid exchange rate: usdToInr must be a positive number");
  }
  const excluded = new Set(opts.excludeCategories ?? DEFAULT_EXCLUDED_CATEGORIES);

  let rows: ReturnType<typeof toProductRow>[];
  let skipped = 0;
  try {
    const raw = await fetchProducts(opts);
    rows = [];
    for (const item of raw) {
      const parsed = DummyProductSchema.safeParse(item);
      if (!parsed.success) {
        skipped++;
        continue;
      }
      if (excluded.has(parsed.data.category)) continue;
      const row = toProductRow(parsed.data, opts.usdToInr);
      if (!row.imageUrl) {
        skipped++;
        continue;
      }
      rows.push(row);
    }
    if (rows.length === 0) throw new Error("Catalogue had no usable products");
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.warn({ error }, "could not refresh the catalogue");
    const existing = await db.product.count({ where: { active: true } });
    if (existing > 0) return { source: "kept", synced: existing, error };
    await seedProducts(db);
    return {
      source: "fallback",
      synced: await db.product.count({ where: { active: true } }),
      error,
    };
  }

  await db.$transaction(
    rows.map((r) =>
      db.product.upsert({
        where: { slug: r.slug },
        update: { ...r, active: true },
        create: r,
      }),
    ),
  );
  const retired = await db.product.updateMany({
    where: { active: true, slug: { notIn: rows.map((r) => r.slug) } },
    data: { active: false },
  });
  return { source: "dummyjson", synced: rows.length, skipped, retired: retired.count };
}
