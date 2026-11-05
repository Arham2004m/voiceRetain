import type { CartDTO, ProductDTO } from "@voiceretain/shared";
import type { Db } from "../db/prisma";
import type { Prisma } from "../generated/prisma/client";
import { conflict, notFound, unprocessable } from "../http/errors";
import { cartInclude, toCartDTO, toProductDTO } from "../mappers/cart.mapper";

type Tx = Prisma.TransactionClient;
export type ItemInput = { productId: string; quantity: number };

const EDITABLE = new Set(["ACTIVE", "CHECKOUT_STARTED", "ABANDONED"]);
const MAX_QTY = 10;

export async function listProducts(db: Db): Promise<ProductDTO[]> {
  const products = await db.product.findMany({ orderBy: { name: "asc" } });
  return products.map(toProductDTO);
}

/** Merges duplicate product ids and resolves them to current catalogue prices. */
async function resolveItems(db: Db | Tx, items: ItemInput[]) {
  const merged = new Map<string, number>();
  for (const i of items) {
    merged.set(i.productId, Math.min(MAX_QTY, (merged.get(i.productId) ?? 0) + i.quantity));
  }
  const products = await db.product.findMany({ where: { id: { in: [...merged.keys()] } } });
  if (products.length !== merged.size) throw unprocessable("One or more products do not exist");
  const rows = products.map((p) => ({
    productId: p.id,
    quantity: merged.get(p.id)!,
    unitPricePaise: p.pricePaise,
  }));
  const subtotalPaise = rows.reduce((sum, r) => sum + r.quantity * r.unitPricePaise, 0);
  return { rows, subtotalPaise };
}

export async function createCart(db: Db, items: ItemInput[]): Promise<CartDTO> {
  const { rows, subtotalPaise } = await resolveItems(db, items);
  const cart = await db.cart.create({
    data: { subtotalPaise, items: { create: rows } },
    include: cartInclude,
  });
  return toCartDTO(cart);
}

export async function getCart(db: Db, id: string): Promise<CartDTO> {
  const cart = await db.cart.findUnique({ where: { id }, include: cartInclude });
  if (!cart) throw notFound("Cart not found");
  return toCartDTO(cart);
}

export async function replaceItems(db: Db, id: string, items: ItemInput[]): Promise<CartDTO> {
  return db.$transaction(async (tx) => {
    const cart = await tx.cart.findUnique({ where: { id } });
    if (!cart) throw notFound("Cart not found");
    if (!EDITABLE.has(cart.status)) throw conflict("Cart can no longer be changed");
    const { rows, subtotalPaise } = await resolveItems(tx, items);
    await tx.cartItem.deleteMany({ where: { cartId: id } });
    await tx.cartItem.createMany({ data: rows.map((r) => ({ ...r, cartId: id })) });
    const updated = await tx.cart.update({
      where: { id },
      data: { subtotalPaise },
      include: cartInclude,
    });
    return toCartDTO(updated);
  });
}
