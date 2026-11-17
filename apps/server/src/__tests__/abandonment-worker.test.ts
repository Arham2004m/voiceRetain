import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPrisma, resetTestDb } from "../db/prisma";
import { processAbandonmentCheck } from "../queue/abandonment.worker";
import { makeCart } from "./setup/fixtures";
import { testEnv } from "./setup/test-env";

const prisma = createPrisma(testEnv().DATABASE_URL);
const startCall = vi.fn();

beforeEach(async () => {
  await resetTestDb(prisma);
  startCall.mockReset();
  startCall.mockResolvedValue(undefined);
});
afterAll(async () => {
  await prisma.$disconnect();
});

const run = (cartId: string) => processAbandonmentCheck(cartId, { db: prisma, startCall });

describe("processAbandonmentCheck", () => {
  it("calls when checkout started and consented", async () => {
    const { cartId } = await makeCart(prisma);
    expect(await run(cartId)).toBe("CALLED");
    expect(startCall).toHaveBeenCalledTimes(1);
    expect(startCall.mock.calls[0]?.[0]).toBe(cartId);
    const cart = await prisma.cart.findUniqueOrThrow({ where: { id: cartId } });
    expect(cart.status).toBe("ABANDONED");
    expect(cart.abandonedAt).not.toBeNull();
  });

  it("runs the post-commit hook returned by startCall after the transaction", async () => {
    const { cartId } = await makeCart(prisma);
    const hook = vi.fn();
    startCall.mockResolvedValue(hook);
    await run(cartId);
    expect(hook).toHaveBeenCalledTimes(1);
  });

  it("does not call when cart completed before job runs", async () => {
    const { cartId } = await makeCart(prisma, { status: "COMPLETED" });
    expect(await run(cartId)).toBe("SKIPPED_NOT_PENDING");
    expect(startCall).not.toHaveBeenCalled();
  });

  it("skips without consent", async () => {
    const { cartId } = await makeCart(prisma, { consent: false });
    expect(await run(cartId)).toBe("SKIPPED_NO_CONSENT");
    expect(startCall).not.toHaveBeenCalled();
    const cart = await prisma.cart.findUniqueOrThrow({ where: { id: cartId } });
    expect(cart.status).toBe("CHECKOUT_STARTED");
  });

  it("skips when customer already has a RINGING or IN_PROGRESS call", async () => {
    const first = await makeCart(prisma);
    await prisma.callLog.create({
      data: { cartId: first.cartId, customerId: first.customerId!, status: "RINGING" },
    });
    const second = await makeCart(prisma);
    expect(await run(second.cartId)).toBe("SKIPPED_ACTIVE_CALL");
    expect(startCall).not.toHaveBeenCalled();
  });

  it("skips unknown cart", async () => {
    expect(await run("does-not-exist")).toBe("SKIPPED_NOT_FOUND");
  });

  it("rolls the cart status back when startCall throws, so a retry can still call", async () => {
    const { cartId } = await makeCart(prisma);
    startCall.mockRejectedValueOnce(new Error("boom"));
    await expect(run(cartId)).rejects.toThrow("boom");
    const cart = await prisma.cart.findUniqueOrThrow({ where: { id: cartId } });
    expect(cart.status).toBe("CHECKOUT_STARTED");
    expect(await run(cartId)).toBe("CALLED");
  });
});
