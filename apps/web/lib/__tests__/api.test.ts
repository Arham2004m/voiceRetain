import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError, api } from "../api";

const fetchMock = vi.fn();

beforeEach(() => {
  process.env.NEXT_PUBLIC_API_URL = "http://api.test";
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("api client", () => {
  it("getProducts hits ${NEXT_PUBLIC_API_URL}/api/products", async () => {
    fetchMock.mockResolvedValue(json(200, [{ id: "p1" }]));
    expect(await api.getProducts()).toEqual([{ id: "p1" }]);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://api.test/api/products");
  });

  it("sends JSON bodies for writes", async () => {
    fetchMock.mockResolvedValue(json(201, { id: "c1" }));
    await api.createCart([{ productId: "p1", quantity: 2 }]);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://api.test/api/carts");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ items: [{ productId: "p1", quantity: 2 }] });
    expect(init.headers["content-type"]).toBe("application/json");
  });

  it("builds the per-cart routes", async () => {
    fetchMock.mockImplementation(async () => json(200, {}));
    await api.replaceItems("c1", []);
    await api.checkout("c1", { name: "Rohan", phone: "9876543210", consentToCall: true });
    await api.completeOrder("c1", "VR-AAAA-BBBB");
    await api.validateVoucher({ code: "VR-AAAA-BBBB", cartId: "c1" });
    expect(fetchMock.mock.calls.map((c) => [c[0], c[1].method])).toEqual([
      ["http://api.test/api/carts/c1/items", "PUT"],
      ["http://api.test/api/carts/c1/checkout", "POST"],
      ["http://api.test/api/carts/c1/complete", "POST"],
      ["http://api.test/api/vouchers/validate", "POST"],
    ]);
  });

  it("throws ApiClientError carrying the server's code on a non-2xx", async () => {
    fetchMock.mockResolvedValue(
      json(409, { error: { code: "CONFLICT", message: "Cart is already completed" } }),
    );
    const err = await api.getCart("c1").catch((e) => e);
    expect(err).toBeInstanceOf(ApiClientError);
    expect(err).toMatchObject({
      status: 409,
      code: "CONFLICT",
      message: "Cart is already completed",
    });
  });

  it("keeps validation details from the server", async () => {
    fetchMock.mockResolvedValue(
      json(400, { error: { code: "VALIDATION_ERROR", message: "Invalid request", details: [1] } }),
    );
    const err = await api.getCart("c1").catch((e) => e);
    expect(err.details).toEqual([1]);
  });

  it("explains an unreachable server in plain words", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    const err = await api.getProducts().catch((e) => e);
    expect(err).toBeInstanceOf(ApiClientError);
    expect(err).toMatchObject({ status: 0, code: "NETWORK_ERROR" });
    expect(err.message).toMatch(/reach/i);
  });

  it("survives an error response that is not JSON", async () => {
    fetchMock.mockResolvedValue(new Response("Bad gateway", { status: 502 }));
    const err = await api.getProducts().catch((e) => e);
    expect(err).toMatchObject({ status: 502, code: "HTTP_502" });
  });
});
