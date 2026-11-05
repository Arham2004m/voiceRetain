import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Redis } from "ioredis";
import { createApp } from "../app";
import { createTestContext } from "./setup/test-app";

const ctx = createTestContext();

afterAll(() => ctx.close());

describe("GET /api/health", () => {
  it("returns 200 with live dependencies", async () => {
    const res = await request(ctx.app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, db: "up", redis: "up" });
  });

  it("returns 503 when redis ping rejects", async () => {
    const broken = { ping: () => Promise.reject(new Error("down")) } as unknown as Redis;
    const app = createApp({ ...ctx, redis: broken });
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ ok: false, db: "up", redis: "down" });
  });

  it("returns the error shape for unknown routes", async () => {
    const res = await request(ctx.app).get("/api/nope");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});
