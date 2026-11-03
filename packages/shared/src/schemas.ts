import { z } from "zod";
import { isValidIndianMobile, normalizePhone } from "./phone";

const cartItem = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().min(1).max(10),
});

export const phoneField = z
  .string()
  .transform((s) => normalizePhone(s) ?? s)
  .refine(isValidIndianMobile, "Enter a valid 10-digit Indian mobile number");

export const CreateCartInput = z.object({ items: z.array(cartItem).min(1) });
export const ReplaceCartItemsInput = z.object({ items: z.array(cartItem) });

const customerFields = {
  name: z.string().trim().min(2).max(60),
  phone: phoneField,
  email: z.string().trim().email().optional(),
  consentToCall: z.boolean(),
};

export const CheckoutInput = z.object(customerFields);
export const ValidateVoucherInput = z.object({
  code: z.string().trim().min(1),
  cartId: z.string(),
});
export const CompleteOrderInput = z.object({ voucherCode: z.string().trim().min(1).optional() });
export const CartAbandonedWebhookInput = z.object({
  customer: z.object(customerFields),
  items: z.array(cartItem).min(1),
});
export const SearchQuery = z.object({ q: z.string().trim().min(2).max(50) });
export const DemoConfigInput = z.object({
  abandonDelayMs: z.number().int().min(5000).max(600000),
});
export const PaginationQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateCartInputType = z.infer<typeof CreateCartInput>;
export type CheckoutInputType = z.infer<typeof CheckoutInput>;
