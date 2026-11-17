import type { Db } from "../db/prisma";

export const PRODUCTS = [
  {
    slug: "wireless-earbuds-pro",
    name: "Wireless Earbuds Pro",
    description: "Noise-reducing earbuds with 24-hour battery life in the case.",
    pricePaise: 149900,
  },
  {
    slug: "smart-fitness-band",
    name: "Smart Fitness Band",
    description: "Tracks steps, heart rate and sleep with a bright AMOLED display.",
    pricePaise: 249900,
  },
  {
    slug: "cotton-hoodie",
    name: "Cotton Hoodie",
    description: "Soft brushed-cotton hoodie with a roomy front pocket.",
    pricePaise: 119900,
  },
  {
    slug: "steel-water-bottle",
    name: "Steel Water Bottle",
    description: "Insulated 750 ml bottle that keeps drinks cold for a full day.",
    pricePaise: 59900,
  },
  {
    slug: "laptop-backpack",
    name: "Laptop Backpack",
    description: "Water-resistant backpack with a padded 15.6 inch laptop sleeve.",
    pricePaise: 189900,
  },
  {
    slug: "desk-lamp-led",
    name: "LED Desk Lamp",
    description: "Dimmable LED lamp with three colour temperatures and a USB port.",
    pricePaise: 89900,
  },
].map((p) => ({ ...p, category: "everyday", imageUrl: `/products/${p.slug}.svg` }));

export async function seedProducts(db: Db): Promise<void> {
  for (const p of PRODUCTS) {
    await db.product.upsert({
      where: { slug: p.slug },
      update: {
        name: p.name,
        description: p.description,
        pricePaise: p.pricePaise,
        imageUrl: p.imageUrl,
        category: p.category,
        active: true,
      },
      create: p,
    });
  }
}
