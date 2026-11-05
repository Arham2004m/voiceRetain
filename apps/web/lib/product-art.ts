/**
 * How each product looks on the shelf. The catalogue only knows names and prices; colour and
 * placement are a storefront decision, so they live here, keyed by slug.
 */
export interface Art {
  slug: string;
  /** Tile background and the text colour that reads on it. */
  tile: string;
  /** Whether the tile is dark enough that the primary (marigold) button should be used on it. */
  dark: boolean;
  /** Grid span on wide screens. */
  span: string;
}

export const SHELF: Art[] = [
  {
    slug: "wireless-earbuds-pro",
    tile: "bg-marigold text-ink",
    dark: false,
    span: "lg:col-span-7",
  },
  { slug: "smart-fitness-band", tile: "bg-leaf text-paper", dark: true, span: "lg:col-span-5" },
  { slug: "cotton-hoodie", tile: "bg-lotus text-ink", dark: false, span: "lg:col-span-4" },
  { slug: "steel-water-bottle", tile: "bg-peacock text-paper", dark: true, span: "lg:col-span-3" },
  { slug: "laptop-backpack", tile: "bg-kumkum text-paper", dark: true, span: "lg:col-span-5" },
  { slug: "desk-lamp-led", tile: "bg-sky text-ink", dark: false, span: "lg:col-span-7" },
];

const FALLBACK: Omit<Art, "slug"> = { tile: "bg-sky text-ink", dark: false, span: "lg:col-span-4" };

export const artFor = (slug: string): Art =>
  SHELF.find((a) => a.slug === slug) ?? { slug, ...FALLBACK };

/** `/products/cotton-hoodie.svg` → `cotton-hoodie` */
export const slugFromImage = (imageUrl: string): string =>
  imageUrl
    .split("/")
    .pop()
    ?.replace(/\.svg$/, "") ?? "";

export const shelfPosition = (slug: string): number => {
  const i = SHELF.findIndex((a) => a.slug === slug);
  return i === -1 ? SHELF.length : i;
};
