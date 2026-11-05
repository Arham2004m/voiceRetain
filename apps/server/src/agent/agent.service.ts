import type { Redis } from "ioredis";
import type { Env } from "../config/env";
import type { Db } from "../db/prisma";
import { logger } from "../lib/logger";
import { issueVoucher } from "../vouchers/voucher.service";
import type { Agent, AgentTurnResult } from "./agent.types";
import type {
  ChatMessage,
  FunctionCallRequest,
  FunctionResponseMessage,
  LlmClient,
} from "./llm.types";
import { buildCallContext, buildSystemPrompt, historyFromTurns } from "./prompt";
import { END_CALL, END_REASONS, ISSUE_DISCOUNT_CODE, TOOL_DECLARATIONS } from "./tools";

const MAX_ROUND_TRIPS = 3;
const FALLBACK_REPLY = "Sorry, I didn't catch that properly. Could you say that again?";
const GIVE_UP_REPLY =
  "I'm having trouble on my end, so I'll let you go. Your cart is saved if you want to finish later. Goodbye!";
const DEFAULT_GOODBYE = "Thank you for your time. Goodbye!";

export interface AgentServiceDeps {
  db: Db;
  redis: Redis;
  env: Pick<
    Env,
    "LLM_TIMEOUT_MS" | "MAX_DISCOUNT_PERCENT" | "MIN_CART_FOR_DISCOUNT_PAISE" | "VOUCHER_TTL_HOURS"
  >;
  llm: LlmClient;
  metrics?: { schedule(): void };
}

/** The model speaks plain text on a call; markdown characters would be read out loud. */
function cleanReply(text: string): string {
  return text.replace(/[*#`]/g, "").replace(/\s+/g, " ").trim();
}

export function createAgentService(deps: AgentServiceDeps): Agent {
  const { db, redis, env, llm } = deps;

  return {
    async runTurn({ callId, customerText, consecutiveFailures }): Promise<AgentTurnResult> {
      const startedAt = Date.now();
      const done = (r: Omit<AgentTurnResult, "latencyMs">): AgentTurnResult => ({
        ...r,
        latencyMs: Date.now() - startedAt,
      });

      try {
        const context = await buildCallContext(db, callId, {
          maxDiscountPercent: env.MAX_DISCOUNT_PERCENT,
        });
        const turns = await db.transcriptTurn.findMany({
          where: { callId },
          orderBy: { createdAt: "asc" },
        });
        const history: ChatMessage[] = historyFromTurns(turns);
        // CallService stores the customer's turn before asking us; add it only if it is missing.
        const lastTurn = turns[turns.length - 1];
        if (!(lastTurn?.speaker === "CUSTOMER" && lastTurn.text === customerText)) {
          history.push({ role: "user", text: customerText });
        }
        const systemPrompt = buildSystemPrompt(context);

        let voucher: AgentTurnResult["voucher"];

        for (let round = 0; round < MAX_ROUND_TRIPS; round++) {
          const out = await llm.generate({
            systemPrompt,
            history,
            tools: TOOL_DECLARATIONS,
            timeoutMs: env.LLM_TIMEOUT_MS,
          });

          if (out.functionCalls.length === 0) {
            const reply = cleanReply(out.text ?? "");
            if (!reply) break; // nothing usable: handled as a failure below
            return done({ replyText: reply, voucher, endsCall: false, failed: false });
          }

          const responses: FunctionResponseMessage[] = [];
          let endReason: string | undefined;
          for (const call of out.functionCalls) {
            if (call.name === END_CALL) {
              const reason = String(call.args.reason ?? "");
              endReason = (END_REASONS as readonly string[]).includes(reason) ? reason : "OTHER";
              responses.push(respondTo(call, { ok: true }));
              continue;
            }
            if (call.name === ISSUE_DISCOUNT_CODE) {
              const { response, card } = await runIssueDiscount(call);
              if (card) voucher = card;
              responses.push(respondTo(call, response));
              continue;
            }
            responses.push(respondTo(call, { ok: false, reason: "UNKNOWN_TOOL" }));
          }

          // endCall is terminal: the goodbye is whatever the model said alongside it.
          if (endReason !== undefined) {
            const reply = cleanReply(out.text ?? "") || DEFAULT_GOODBYE;
            return done({ replyText: reply, voucher, endsCall: true, endReason, failed: false });
          }

          history.push({
            role: "model",
            text: out.text,
            functionCalls: out.functionCalls,
            raw: out.raw,
          });
          history.push({ role: "user", functionResponses: responses });
        }
        // Three round-trips (or an empty answer) without usable text.
        return failure(consecutiveFailures, done);
      } catch (err) {
        logger.error({ err, callId }, "agent turn failed");
        return failure(consecutiveFailures, done);
      }

      async function runIssueDiscount(call: FunctionCallRequest) {
        try {
          const result = await issueVoucher(
            { db, redis, env, metrics: deps.metrics },
            { cartId: await cartIdOf(callId), callId, requestedPercent: call.args.percent },
          );
          if (!result.ok) return { response: { ok: false, reason: result.reason } };
          return {
            card: result.voucher,
            response: {
              ok: true,
              code: result.voucher.code,
              percent: result.voucher.percent,
              spokenCode: result.spokenCode,
              expiresInHours: env.VOUCHER_TTL_HOURS,
              alreadyIssued: result.alreadyIssued,
            },
          };
        } catch (err) {
          logger.error({ err, callId }, "issueDiscountCode failed");
          return { response: { ok: false, reason: "UNAVAILABLE" } };
        }
      }
    },
  };

  async function cartIdOf(callId: string): Promise<string> {
    const call = await db.callLog.findUniqueOrThrow({
      where: { id: callId },
      select: { cartId: true },
    });
    return call.cartId;
  }
}

const respondTo = (
  call: FunctionCallRequest,
  response: Record<string, unknown>,
): FunctionResponseMessage => ({
  name: call.name,
  response,
  ...(call.id ? { id: call.id } : {}),
});

/** PRD §8.6: a polite retry line, and a graceful goodbye on the third failure in a row. */
function failure(
  consecutiveFailures: number,
  done: (r: Omit<AgentTurnResult, "latencyMs">) => AgentTurnResult,
): AgentTurnResult {
  if (consecutiveFailures >= 2) {
    return done({
      replyText: GIVE_UP_REPLY,
      endsCall: true,
      endReason: "LLM_FAILURE",
      failed: true,
    });
  }
  return done({ replyText: FALLBACK_REPLY, endsCall: false, failed: true });
}
