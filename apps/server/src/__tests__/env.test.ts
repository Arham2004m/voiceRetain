import { describe, expect, it } from "vitest";
import { loadEnv } from "../config/env";

const valid = {
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  REDIS_URL: "redis://localhost:6379",
  MOCK_LLM: "true",
};

describe("loadEnv", () => {
  it("applies defaults and coerces numbers", () => {
    const env = loadEnv({ ...valid, PORT: "5000" });
    expect(env.PORT).toBe(5000);
    expect(env.ABANDON_DELAY_MS).toBe(30000);
    expect(env.MOCK_LLM).toBe(true);
    expect(env.MAX_DISCOUNT_PERCENT).toBe(15);
  });

  it("clamps MAX_DISCOUNT_PERCENT to 15", () => {
    expect(loadEnv({ ...valid, MAX_DISCOUNT_PERCENT: "40" }).MAX_DISCOUNT_PERCENT).toBe(15);
  });

  it("allows lowering the cap", () => {
    expect(loadEnv({ ...valid, MAX_DISCOUNT_PERCENT: "10" }).MAX_DISCOUNT_PERCENT).toBe(10);
  });

  it("throws naming a missing DATABASE_URL", () => {
    const { DATABASE_URL: _omit, ...rest } = valid;
    expect(() => loadEnv(rest)).toThrow(/DATABASE_URL/);
  });

  it("requires GEMINI_API_KEY when MOCK_LLM=false", () => {
    expect(() => loadEnv({ ...valid, MOCK_LLM: "false" })).toThrow(/GEMINI_API_KEY/);
    expect(loadEnv({ ...valid, MOCK_LLM: "false", GEMINI_API_KEY: "k" }).MOCK_LLM).toBe(false);
  });

  it("lists every invalid key", () => {
    expect(() => loadEnv({ PORT: "abc" })).toThrow(
      /DATABASE_URL[\s\S]*PORT|PORT[\s\S]*DATABASE_URL/,
    );
  });
});
