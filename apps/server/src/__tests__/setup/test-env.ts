import { loadEnv, type Env } from "../../config/env";

/** Env pointing at the test database; MOCK_LLM on so nothing touches the network. */
export function testEnv(overrides: Partial<Env> = {}): Env {
  const base = loadEnv(process.env);
  return {
    ...base,
    DATABASE_URL: base.DATABASE_URL_TEST ?? base.DATABASE_URL,
    MOCK_LLM: true,
    ...overrides,
  };
}

/** Tests use Redis logical DB 1 so they never touch dev keys. */
export function testRedisUrl(): string {
  return `${process.env.REDIS_URL!.replace(/\/\d*$/, "")}/1`;
}

export const TEST_QUEUE_PREFIX = "test";
