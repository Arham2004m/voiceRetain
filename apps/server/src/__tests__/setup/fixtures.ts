import type { Db } from "../../db/prisma";
import { seedProducts } from "../../seed/products";
import type { CartStatus } from "../../generated/prisma/client";

export async function makeCart(
  prisma: Db,
  opts: {
    status?: CartStatus;
    consent?: boolean;
    withCustomer?: boolean;
    phone?: string;
    name?: string;
    slug?: string;
    quantity?: number;
  } = {},
) {
  await seedProducts(prisma);
  const product = await prisma.product.findUniqueOrThrow({
    where: { slug: opts.slug ?? "wireless-earbuds-pro" },
  });
  const quantity = opts.quantity ?? 1;
  const customer =
    opts.withCustomer === false
      ? null
      : await prisma.customer.upsert({
          where: { phone: opts.phone ?? "9876543210" },
          update: {},
          create: {
            name: opts.name ?? "Rohan",
            phone: opts.phone ?? "9876543210",
            consentToCall: opts.consent ?? true,
          },
        });
  const cart = await prisma.cart.create({
    data: {
      status: opts.status ?? "CHECKOUT_STARTED",
      customerId: customer?.id ?? null,
      subtotalPaise: product.pricePaise * quantity,
      checkoutStartedAt: new Date(),
      items: {
        create: [{ productId: product.id, quantity, unitPricePaise: product.pricePaise }],
      },
    },
  });
  return { cartId: cart.id, customerId: customer?.id ?? null, product };
}
