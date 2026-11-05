import { AGENT_NAME, STORE_NAME } from "@voiceretain/shared";

export function buildGreeting(ctx: { customerName: string; items: { name: string }[] }): string {
  const firstName = ctx.customerName.trim().split(/\s+/)[0] ?? ctx.customerName;
  const first = ctx.items[0]?.name ?? "your items";
  const more = ctx.items.length - 1;
  const extra = more <= 0 ? "" : more === 1 ? " and 1 more item" : ` and ${more} more items`;
  return `Hi ${firstName}, this is ${AGENT_NAME} from ${STORE_NAME}. I noticed you left ${first}${extra} in your cart. Was there anything that stopped you from finishing your order?`;
}
