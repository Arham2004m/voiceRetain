import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import pg from "pg";
import { createApp } from "../app";
import { createRedis } from "../lib/redis";
import { loadEnv } from "../config/env";

const env = loadEnv(process.env);
const pool = new pg.Pool({ connectionString: env.DATABASE_URL_TEST ?? env.DATABASE_URL });
const redis = createRedis(env.REDIS_URL);
const db = { ping: async () => void (await pool.query("select 1")) };

afterAll(async () => {
  await pool.end();
  redis.disconnect();
});

describe("GET /api/health", () => {
  it("returns 200 with live dependencies", async () => {
    const res = await request(createApp({ db, redis, env })).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, db: "up", redis: "up" });
  });

  it("returns 503 when redis ping rejects", async () => {
    const broken = { ping: () => Promise.reject(new Error("down")) };
    const res = await request(createApp({ db, redis: broken, env })).get("/api/health");
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ ok: false, db: "up", redis: "down" });
  });

  it("returns the error shape for unknown routes", async () => {
    const res = await request(createApp({ db, redis, env })).get("/api/nope");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});
