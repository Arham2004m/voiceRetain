import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { syncCatalogue, toProductRow, type DummyProduct } from "../seed/catalogue";
import { seedProducts } from "../seed/products";
import { createTestContext } from "./setup/test-app";

const ctx = createTestContext();
beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

const dummy = (over: Partial<DummyProduct> & { id: number }): DummyProduct => ({
  title: `Product ${over.id}`,
  description: "A fine thing.",
  category: "beauty",
  price: 10,
  thumbnail: `https://cdn.example.com/${over.id}/thumb.webp`,
  images: [`https://cdn.example.com/${over.id}/1.webp`],
  ...over,
});

const feed = (products: unknown[]) =>
  vi.fn(
    async () => new Response(JSON.stringify({ products, total: products.length }), { status: 200 }),
  );

const sync = (fetchFn: typeof fetch, over: { usdToInr?: number } = {}) =>
  syncCatalogue(ctx.prisma, { fetchFn, usdToInr: over.usdToInr ?? 85 });

describe("toProductRow", () => {
  it("converts dollars to whole-rupee paise at the given rate", () => {
    expect(toProductRow(dummy({ id: 1, price: 9.99 }), 85).pricePaise).toBe(84900);
    expect(toProductRow(dummy({ id: 2, price: 1999 }), 85).pricePaise).toBe(16991500);
  });

  it("never prices anything below one rupee", () => {
    expect(toProductRow(dummy({ id: 3, price: 0.001 }), 85).pricePaise).toBe(100);
  });

  it("builds a stable slug and takes the first image, falling back to the thumbnail", () => {
    const row = toProductRow(dummy({ id: 7, title: "Eyeshadow Palette", category: "beauty" }), 85);
    expect(row).toMatchObject({
      slug: "dj-7",
      name: "Eyeshadow Palette",
      category: "beauty",
      imageUrl: "https://cdn.example.com/7/1.webp",
    });
    expect(toProductRow(dummy({ id: 8, images: [] }), 85).imageUrl).toBe(
      "https://cdn.example.com/8/thumb.webp",
    );
  });
});

describe("syncCatalogue", () => {
  it("loads the catalogue into the database", async () => {
    const result = await sync(
      feed([dummy({ id: 1, price: 9.99 }), dummy({ id: 2, category: "laptops" })]),
    );
    expect(result).toMatchObject({ source: "dummyjson", synced: 2, skipped: 0 });
    const rows = await ctx.prisma.product.findMany({ orderBy: { slug: "asc" } });
    expect(rows.map((r) => [r.slug, r.category, r.active])).toEqual([
      ["dj-1", "beauty", true],
      ["dj-2", "laptops", true],
    ]);
    expect(rows[0]?.pricePaise).toBe(84900);
  });

  it("asks for the whole catalogue in one request, selecting only the fields it needs", async () => {
    const fetchFn = feed([dummy({ id: 1 })]);
    await sync(fetchFn);
    const url = new URL(String((fetchFn.mock.calls as unknown as [string][])[0]![0]));
    expect(url.origin + url.pathname).toBe("https://dummyjson.com/products");
    expect(url.searchParams.get("limit")).toBe("0");
    expect(url.searchParams.get("select")).toContain("price");
  });

  it("leaves out vehicles and motorcycles", async () => {
    await sync(
      feed([
        dummy({ id: 1 }),
        dummy({ id: 2, category: "vehicle", price: 20000 }),
        dummy({ id: 3, category: "motorcycle", price: 9000 }),
      ]),
    );
    expect(await ctx.prisma.product.count()).toBe(1);
  });

  it("skips malformed entries and says how many", async () => {
    const result = await sync(
      feed([dummy({ id: 1 }), { id: "x" }, { id: 5, title: "No price", category: "beauty" }, null]),
    );
    expect(result).toMatchObject({ synced: 1, skipped: 3 });
  });

  it("is idempotent and follows price changes", async () => {
    await sync(feed([dummy({ id: 1, price: 10 })]));
    await sync(feed([dummy({ id: 1, price: 20, title: "Renamed" })]));
    const rows = await ctx.prisma.product.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "Renamed", pricePaise: 170000 });
  });

  it("retires products that left the catalogue and revives them when they return", async () => {
    await seedProducts(ctx.prisma); // the six built-in products
    const result = await sync(feed([dummy({ id: 1 })]));
    expect(result).toMatchObject({ source: "dummyjson", retired: 6 });
    expect(await ctx.prisma.product.count({ where: { active: true } })).toBe(1);
    expect(await ctx.prisma.product.count()).toBe(7); // retired rows are kept for old carts and orders

    await sync(feed([dummy({ id: 1 }), dummy({ id: 2 })]));
    expect(await ctx.prisma.product.count({ where: { active: true } })).toBe(2);
    await ctx.prisma.product.update({ where: { slug: "dj-2" }, data: { active: false } });
    await sync(feed([dummy({ id: 1 }), dummy({ id: 2 })]));
    expect((await ctx.prisma.product.findUniqueOrThrow({ where: { slug: "dj-2" } })).active).toBe(
      true,
    );
  });

  it("keeps what is already there when the API cannot be reached", async () => {
    await sync(feed([dummy({ id: 1 })]));
    const down = vi.fn(async () => {
      throw new Error("getaddrinfo ENOTFOUND dummyjson.com");
    });
    const result = await sync(down as unknown as typeof fetch);
    expect(result).toMatchObject({ source: "kept", synced: 1 });
    expect(result.source === "kept" && result.error).toMatch(/ENOTFOUND/);
    expect(await ctx.prisma.product.count({ where: { active: true } })).toBe(1);
  });

  it("falls back to the built-in products when the API is down and the shelves are empty", async () => {
    const down = vi.fn(async () => new Response("Service Unavailable", { status: 503 }));
    const result = await sync(down as unknown as typeof fetch);
    expect(result).toMatchObject({ source: "fallback", synced: 6 });
    expect(await ctx.prisma.product.count({ where: { active: true } })).toBe(6);
  });

  it("treats an empty or unusable response as a failure rather than wiping the shelves", async () => {
    await sync(feed([dummy({ id: 1 })]));
    const result = await sync(feed([]));
    expect(result.source).toBe("kept");
    expect(await ctx.prisma.product.count({ where: { active: true } })).toBe(1);
  });

  it("rejects a nonsensical exchange rate", async () => {
    await expect(sync(feed([dummy({ id: 1 })]), { usdToInr: 0 })).rejects.toThrow(/exchange rate/i);
  });
});
