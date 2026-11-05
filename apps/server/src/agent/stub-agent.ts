import type { Agent, Analyzer } from "./agent.types";

/** Echo agent used until the real agent and analyzer are wired in (Stage 6). */
export const stubAgent: Agent = {
  async runTurn({ customerText }) {
    return { replyText: `You said: ${customerText}`, endsCall: false, latencyMs: 0, failed: false };
  },
};

export const stubAnalyzer: Analyzer = {
  async analyze() {
    return {
      sentiment: "NEUTRAL",
      objection: "NONE",
      intent: "UNDECIDED",
      summary: "Stub analysis.",
    };
  },
};
