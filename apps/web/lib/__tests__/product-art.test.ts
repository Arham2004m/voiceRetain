import { describe, expect, it } from "vitest";
import { categoryLabel, mixCategories, spanFor, toneFor } from "../product-art";

describe("categoryLabel", () => {
  it.each([
    ["beauty", "Beauty"],
    ["home-decoration", "Home decoration"],
    ["mens-watches", "Men's watches"],
    ["womens-bags", "Women's bags"],
    ["kitchen-accessories", "Kitchen accessories"],
    ["everyday", "Everyday"],
  ])("turns %s into %s", (slug, label) => {
    expect(categoryLabel(slug)).toBe(label);
  });
});

describe("mixCategories", () => {
  const p = (category: string, n: number) => ({ category, id: `${category}-${n}` });

  it("alternates between categories so the shelves are not one colour run after another", () => {
    const items = [p("a", 1), p("a", 2), p("a", 3), p("b", 1), p("b", 2), p("c", 1)];
    expect(mixCategories(items).map((i) => i.id)).toEqual([
      "a-1",
      "b-1",
      "c-1",
      "a-2",
      "b-2",
      "a-3",
    ]);
  });

  it("keeps every item exactly once and does not change the input", () => {
    const items = [p("a", 1), p("b", 1), p("a", 2)];
    const copy = [...items];
    const mixed = mixCategories(items);
    expect(mixed).toHaveLength(3);
    expect(new Set(mixed.map((i) => i.id)).size).toBe(3);
    expect(items).toEqual(copy);
  });

  it("handles an empty list", () => {
    expect(mixCategories([])).toEqual([]);
  });
});

describe("toneFor", () => {
  it("gives the same product the same colour every time", () => {
    expect(toneFor("abc123")).toEqual(toneFor("abc123"));
  });

  it("spreads products across the palette", () => {
    const tones = new Set(Array.from({ length: 60 }, (_, i) => toneFor(`product-${i}`).tile));
    expect(tones.size).toBeGreaterThanOrEqual(5);
  });

  it("pairs every background with a text colour that reads on it", () => {
    for (let i = 0; i < 30; i++) {
      const { tile, dark } = toneFor(`p${i}`);
      expect(tile).toMatch(dark ? /text-paper/ : /text-ink/);
    }
  });
});

describe("spanFor", () => {
  it("repeats a pattern whose rows add up to a full 12-column row", () => {
    const widths = Array.from({ length: 7 }, (_, i) =>
      Number(spanFor(i).replace("lg:col-span-", "")),
    );
    expect(widths.slice(0, 2).reduce((a, b) => a + b)).toBe(12);
    expect(widths.slice(2, 5).reduce((a, b) => a + b)).toBe(12);
    expect(widths.slice(5, 7).reduce((a, b) => a + b)).toBe(12);
    expect(spanFor(7)).toBe(spanFor(0));
    expect(spanFor(15)).toBe(spanFor(1));
  });
});
