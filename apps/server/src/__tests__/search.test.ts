import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { bumpCacheVersion } from "../services/cache";
import { escapeLike, normalizeQuery, search } from "../services/search.service";
import { makeCart } from "./setup/fixtures";
import { createTestContext } from "./setup/test-app";

const ctx = createTestContext();
beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

const deps = () => ({ db: ctx.prisma, redis: ctx.redis });

async function seedCall(name: string, phone: string, summary?: string, code?: string) {
  const { cartId, customerId } = await makeCart(ctx.prisma, { name, phone, status: "ABANDONED" });
  const call = await ctx.prisma.callLog.create({
    data: { cartId, customerId: customerId!, status: "ENDED", summary: summary ?? null },
  });
  if (code) {
    await ctx.prisma.voucher.create({
      data: {
        code,
        percent: 10,
        cartId,
        callId: call.id,
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });
  }
  return { cartId, customerId: customerId!, callId: call.id };
}

describe("escapeLike", () => {
  it("puts a backslash before percent, underscore and backslash only", () => {
    expect(escapeLike("50%_off\\now")).toBe("50\\%\\_off\\\\now");
    expect(escapeLike("plain text")).toBe("plain text");
  });
});

describe("normalizeQuery", () => {
  it("trims, lowercases and collapses spaces", () => {
    expect(normalizeQuery("  Rohan   MEHTA ")).toBe("rohan mehta");
  });
});

describe("search", () => {
  it("finds a customer by name, case-insensitively", async () => {
    await seedCall("Rohan Mehta", "9876543210");
    await seedCall("Asha Rao", "9123456789");
    const out = await search(deps(), "rohan");
    expect(out.customers).toEqual([
      { id: expect.any(String), name: "Rohan Mehta", phone: "9876543210" },
    ]);
  });

  it("finds a customer by part of the phone number", async () => {
    await seedCall("Rohan Mehta", "9876543210");
    await seedCall("Asha Rao", "9123456789");
    const out = await search(deps(), "76543");
    expect(out.customers.map((c) => c.name)).toEqual(["Rohan Mehta"]);
  });

  it("finds a voucher by code in any case", async () => {
    await seedCall("Rohan", "9876543210", undefined, "VR-8KQ2-X7MD");
    const out = await search(deps(), "vr-8kq2");
    expect(out.vouchers.map((v) => v.code)).toEqual(["VR-8KQ2-X7MD"]);
  });

  it("finds a call by words in its summary, returning the call card", async () => {
    await seedCall("Rohan", "9876543210", "Customer raised shipping cost and accepted a code.");
    await seedCall("Asha", "9123456789", "Customer was undecided.");
    const out = await search(deps(), "shipping");
    expect(out.calls).toHaveLength(1);
    expect(out.calls[0]).toMatchObject({
      customerName: "Rohan",
      summary: expect.stringContaining("shipping"),
    });
  });

  it("returns at most five of each kind", async () => {
    for (let i = 0; i < 7; i++)
      await seedCall(`Rohan ${i}`, `98000000${String(i).padStart(2, "0")}`);
    expect((await search(deps(), "rohan")).customers).toHaveLength(5);
  });

  it("treats percent and underscore as plain text, not wildcards", async () => {
    await seedCall("Rohan", "9876543210");
    const out = await search(deps(), "%%");
    expect(out).toEqual({ customers: [], calls: [], vouchers: [] });
    expect((await search(deps(), "r_h")).customers).toEqual([]);
  });

  it("still finds text that really contains a percent sign or underscore", async () => {
    await seedCall("Rohan", "9876543210", "Asked for 50% off.");
    await seedCall("Asha", "9123456789", "Wanted free_shipping.");
    expect((await search(deps(), "50% off")).calls.map((c) => c.customerName)).toEqual(["Rohan"]);
    expect((await search(deps(), "free_ship")).calls.map((c) => c.customerName)).toEqual(["Asha"]);
  });

  it("serves a repeat search from the cache until something is written", async () => {
    await seedCall("Rohan Mehta", "9876543210");
    expect((await search(deps(), "rohan")).customers).toHaveLength(1);

    await seedCall("Rohan Singh", "9123456780"); // straight to the database: no version bump
    expect((await search(deps(), "ROHAN ")).customers).toHaveLength(1); // same normalized query

    await bumpCacheVersion(ctx.redis);
    expect((await search(deps(), "rohan")).customers).toHaveLength(2);
  });
});

describe("GET /api/search", () => {
  it("returns grouped results", async () => {
    await seedCall("Rohan Mehta", "9876543210", "Shipping worry.", "VR-AAAA-BBBB");
    const res = await request(ctx.app).get("/api/search").query({ q: "rohan" });
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(["calls", "customers", "vouchers"]);
    expect(res.body.customers).toHaveLength(1);
  });

  it("rejects a query that is too short or too long with 400", async () => {
    expect((await request(ctx.app).get("/api/search").query({ q: "a" })).status).toBe(400);
    expect((await request(ctx.app).get("/api/search").query({ q: " a " })).status).toBe(400);
    expect(
      (
        await request(ctx.app)
          .get("/api/search")
          .query({ q: "x".repeat(51) })
      ).status,
    ).toBe(400);
    expect((await request(ctx.app).get("/api/search")).status).toBe(400);
  });
});
