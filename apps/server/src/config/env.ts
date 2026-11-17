import { z } from "zod";
import { HARD_MAX_DISCOUNT } from "@voiceretain/shared";
import { logger } from "../lib/logger";

const bool = z.enum(["true", "false"]).transform((v) => v === "true");
const int = (def: number) => z.coerce.number().int().positive().default(def);

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: int(4000),
    WEB_ORIGIN: z.string().url().default("http://localhost:3000"),
    DATABASE_URL: z.string().min(1),
    DATABASE_URL_TEST: z.string().min(1).optional(),
    REDIS_URL: z.string().min(1),
    GEMINI_API_KEY: z.string().optional(),
    GEMINI_MODEL: z.string().min(1).default("gemini-3.5-flash"),
    MOCK_LLM: bool.default("false"),
    LLM_TIMEOUT_MS: int(8000),
    ABANDON_DELAY_MS: int(30000),
    RING_TIMEOUT_MS: int(30000),
    MAX_CALL_DURATION_MS: int(300000),
    DISCONNECT_GRACE_MS: int(15000),
    MAX_DISCOUNT_PERCENT: int(HARD_MAX_DISCOUNT),
    MIN_CART_FOR_DISCOUNT_PAISE: int(50000),
    VOUCHER_TTL_HOURS: int(24),
    DEMO_MODE: bool.default("true"),
    CATALOGUE_URL: z.string().url().default("https://dummyjson.com/products"),
    /** Rupees per US dollar; the product catalogue is priced in dollars. */
    CATALOGUE_USD_TO_INR: z.coerce.number().positive().default(85),
  })
  .superRefine((v, ctx) => {
    if (!v.MOCK_LLM && !v.GEMINI_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["GEMINI_API_KEY"],
        message: "required when MOCK_LLM=false",
      });
    }
  });

export type Env = z.infer<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv | Record<string, string | undefined>): Env {
  const result = schema.safeParse(source);
  if (!result.success) {
    const lines = result.error.issues.map(
      (i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`,
    );
    throw new Error(`Invalid environment configuration:\n${lines.join("\n")}`);
  }
  const env = result.data;
  if (env.MAX_DISCOUNT_PERCENT > HARD_MAX_DISCOUNT) {
    logger.warn(
      { requested: env.MAX_DISCOUNT_PERCENT },
      `MAX_DISCOUNT_PERCENT clamped to ${HARD_MAX_DISCOUNT}`,
    );
    env.MAX_DISCOUNT_PERCENT = HARD_MAX_DISCOUNT;
  }
  return env;
}

let cached: Env | undefined;
export function getEnv(): Env {
  cached ??= loadEnv(process.env);
  return cached;
}
