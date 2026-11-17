import type { Env } from "../config/env";
import { GeminiLlmClient } from "./gemini.client";
import type { LlmClient } from "./llm.types";
import { MockLlmClient } from "./mock.client";

/** MOCK_LLM=true never touches the network (G4: the demo survives bad Wi-Fi). */
export function createLlm(
  env: Pick<Env, "MOCK_LLM" | "GEMINI_API_KEY" | "GEMINI_MODEL" | "MAX_DISCOUNT_PERCENT">,
): LlmClient {
  if (env.MOCK_LLM) return new MockLlmClient({ maxDiscountPercent: env.MAX_DISCOUNT_PERCENT });
  return new GeminiLlmClient({ apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL });
}
