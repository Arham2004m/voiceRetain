import type { CartDTO, CheckoutInputType, CreateCartInputType } from "@voiceretain/shared";
import type { Redis } from "ioredis";
import type { Env } from "../config/env";
import { getAbandonDelayMs } from "../config/runtime-config";
import type { Db } from "../db/prisma";
import { HttpError, conflict, notFound } from "../http/errors";
import { cartInclude, toCartDTO } from "../mappers/cart.mapper";
import {
  cancelAbandonmentCheck,
  scheduleAbandonmentCheck,
  type AbandonmentQueue,
} from "../queue/abandonment.queue";
import { bumpCacheVersion } from "./cache";
import { createCart } from "./cart.service";

export interface CheckoutDeps {
  prisma: Db;
  redis: Redis;
  queue: AbandonmentQueue;
  env: Env;
}

const CHECKOUT_FROM = new Set(["ACTIVE", "CHECKOUT_STARTED", "ABANDONED"]);

export async function startCheckout(
  deps: CheckoutDeps,
  cartId: string,
  input: CheckoutInputType,
): Promise<CartDTO> {
  const { prisma, redis, queue, env } = deps;

  const existing = await prisma.cart.findUnique({
    where: { id: cartId },
    include: { _count: { select: { items: true } } },
  });
  if (!existing) throw notFound("Cart not found");
  if (!CHECKOUT_FROM.has(existing.status)) throw conflict("Cart is already completed");
  if (existing._count.items === 0) {
    throw new HttpError(422, "EMPTY_CART", "Add at least one item before checking out");
  }

  const cart = await prisma.$transaction(async (tx) => {
    const customer = await tx.customer.upsert({
      where: { phone: input.phone },
      update: { name: input.name, email: input.email ?? null, consentToCall: input.consentToCall },
      create: {
        name: input.name,
        phone: input.phone,
        email: input.email ?? null,
        consentToCall: input.consentToCall,
      },
    });
    return tx.cart.update({
      where: { id: cartId },
      data: { customerId: customer.id, status: "CHECKOUT_STARTED", checkoutStartedAt: new Date() },
      include: cartInclude,
    });
  });
  await bumpCacheVersion(redis);

  if (input.consentToCall) {
    await scheduleAbandonmentCheck(queue, cartId, await getAbandonDelayMs(redis, env));
  } else {
    await cancelAbandonmentCheck(queue, cartId);
  }
  return toCartDTO(cart);
}

export async function handleCartAbandonedWebhook(
  deps: CheckoutDeps,
  input: {
    customer: CheckoutInputType;
    items: CreateCartInputType["items"];
  },
): Promise<{ cartId: string; scheduledInMs: number }> {
  const cart = await createCart(deps.prisma, input.items);
  await startCheckout(deps, cart.id, input.customer);
  const scheduledInMs = input.customer.consentToCall
    ? await getAbandonDelayMs(deps.redis, deps.env)
    : 0;
  return { cartId: cart.id, scheduledInMs };
}
