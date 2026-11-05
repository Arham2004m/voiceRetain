import type { CartDTO, ProductDTO } from "@voiceretain/shared";
import type { Prisma, Product } from "../generated/prisma/client";

export const cartInclude = {
  items: { include: { product: true }, orderBy: { id: "asc" } },
  customer: true,
} satisfies Prisma.CartInclude;

export type CartWithRelations = Prisma.CartGetPayload<{ include: typeof cartInclude }>;

export function toProductDTO(p: Product): ProductDTO {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    description: p.description,
    pricePaise: p.pricePaise,
    imageUrl: p.imageUrl,
  };
}

export function toCartDTO(cart: CartWithRelations): CartDTO {
  return {
    id: cart.id,
    status: cart.status,
    subtotalPaise: cart.subtotalPaise,
    items: cart.items.map((i) => ({
      productId: i.productId,
      name: i.product.name,
      quantity: i.quantity,
      unitPricePaise: i.unitPricePaise,
      imageUrl: i.product.imageUrl,
    })),
    ...(cart.customer
      ? { customer: { name: cart.customer.name, phone: cart.customer.phone } }
      : {}),
  };
}
