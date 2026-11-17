import type { TranscriptTurnDTO } from "@voiceretain/shared";
import type { Env } from "../config/env";
import { logger } from "../lib/logger";
import type { Analyzer, CallAnalysis } from "./agent.types";
import type { LlmClient } from "./llm.types";

const DID_NOT_SPEAK: CallAnalysis = {
  sentiment: "NEUTRAL",
  objection: "NONE",
  intent: "UNDECIDED",
  summary: "Customer did not speak.",
};

const UNAVAILABLE: CallAnalysis = {
  sentiment: "NEUTRAL",
  objection: "OTHER",
  intent: "UNDECIDED",
  summary: "Analysis unavailable.",
};

/** PRD §8.5: one structured LLM call per finished call, with safe defaults around it. */
export function createAnalyzer(deps: {
  llm: LlmClient;
  env: Pick<Env, "LLM_TIMEOUT_MS">;
}): Analyzer {
  return {
    async analyze(turns: TranscriptTurnDTO[]): Promise<CallAnalysis> {
      const spoken = turns.filter((t) => t.speaker !== "SYSTEM");
      if (!spoken.some((t) => t.speaker === "CUSTOMER")) return { ...DID_NOT_SPEAK };

      const transcript = spoken
        .map((t) => `${t.speaker === "AGENT" ? "Agent" : "Customer"}: ${t.text}`)
        .join("\n");
      try {
        const analysis = await deps.llm.analyze({
          transcript,
          timeoutMs: deps.env.LLM_TIMEOUT_MS,
        });
        return { ...analysis, summary: analysis.summary.slice(0, 200) };
      } catch (err) {
        logger.error({ err }, "post-call analysis failed");
        return { ...UNAVAILABLE };
      }
    },
  };
}
