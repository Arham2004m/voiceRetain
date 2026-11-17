/**
 * How products look on the shelf. The catalogue only knows names, prices and pictures, so
 * colour and placement are storefront decisions made here.
 */
export interface Tone {
  /** Tile background and the text colour that reads on it. */
  tile: string;
  /** Dark tiles take the marigold button; light ones the ink button. */
  dark: boolean;
}

const TONES: Tone[] = [
  { tile: "bg-marigold text-ink", dark: false },
  { tile: "bg-leaf text-paper", dark: true },
  { tile: "bg-lotus text-ink", dark: false },
  { tile: "bg-peacock text-paper", dark: true },
  { tile: "bg-kumkum text-paper", dark: true },
  { tile: "bg-sky text-ink", dark: false },
];

/** The same product is always the same colour, on the shelf and in the cart. */
export function toneFor(key: string): Tone {
  let hash = 0;
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return TONES[hash % TONES.length]!;
}

/** Seven tiles make three full 12-column rows: 7+5, 4+3+5, 5+7. Written out so Tailwind sees them. */
const SPANS = [
  "lg:col-span-7",
  "lg:col-span-5",
  "lg:col-span-4",
  "lg:col-span-3",
  "lg:col-span-5",
  "lg:col-span-5",
  "lg:col-span-7",
];

export const spanFor = (index: number): string => SPANS[index % SPANS.length]!;

/** `mens-watches` → `Men's watches` */
export function categoryLabel(slug: string): string {
  const text = slug
    .replace(/^mens-/, "men's ")
    .replace(/^womens-/, "women's ")
    .replace(/-/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Takes one product from each category in turn. The catalogue lists whole categories together,
 * which on a colourful wall reads as a long run of near-identical tiles.
 */
export function mixCategories<T extends { category: string }>(items: T[]): T[] {
  const queues = new Map<string, T[]>();
  for (const item of items) {
    const queue = queues.get(item.category);
    if (queue) queue.push(item);
    else queues.set(item.category, [item]);
  }
  const lists = [...queues.values()];
  const mixed: T[] = [];
  for (let round = 0; mixed.length < items.length; round++) {
    for (const list of lists) {
      const next = list[round];
      if (next) mixed.push(next);
    }
  }
  return mixed;
}
