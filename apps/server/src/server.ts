import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)), quiet: true });

const { createApp } = await import("./app");
const { getEnv } = await import("./config/env");
const { createPrisma } = await import("./db/prisma");
const { createRedis } = await import("./lib/redis");
const { logger } = await import("./lib/logger");
const { createAbandonmentQueue } = await import("./queue/abandonment.queue");
const { startAbandonmentWorker } = await import("./queue/abandonment.worker");
const { createSocketServer, attachSocketHandlers } = await import("./realtime/socket");
const { createCallService } = await import("./calls/call.service");
const { CallTimers } = await import("./calls/call.timers");
const { createLlm } = await import("./agent/create-llm");
const { createAgentService } = await import("./agent/agent.service");
const { createAnalyzer } = await import("./agent/analyzer.service");

async function main() {
  const env = getEnv();
  const prisma = createPrisma(env.DATABASE_URL);
  const redis = createRedis(env.REDIS_URL);
  const queue = createAbandonmentQueue(redis);

  const httpServer = createServer();
  const { io, emitter } = createSocketServer(httpServer, { env });
  // Replaced by the debounced broadcaster in Stage 9.
  const metrics = { schedule: () => undefined };
  const llm = createLlm(env);
  logger.info(
    { llm: env.MOCK_LLM ? "mock" : env.GEMINI_MODEL },
    `agent running on the ${env.MOCK_LLM ? "mock" : "Gemini"} LLM client`,
  );
  const callService = createCallService({
    db: prisma,
    redis,
    emitter,
    timers: new CallTimers(),
    env,
    agent: createAgentService({ db: prisma, redis, env, llm, metrics }),
    analyzer: createAnalyzer({ llm, env }),
    metrics,
  });
  attachSocketHandlers(io, { callService });
  httpServer.on("request", createApp({ prisma, redis, queue, emitter, metrics, env }));

  await callService.recoverStaleCalls();

  const workerConnection = createRedis(env.REDIS_URL, { forBullMQ: true });
  const worker = startAbandonmentWorker({
    db: prisma,
    connection: workerConnection,
    startCall: (cartId, tx) => callService.startCallInTx(cartId, tx),
  });

  httpServer.listen(env.PORT, () => logger.info(`server listening on :${env.PORT}`));

  const shutdown = async () => {
    logger.info("shutting down");
    await worker.close();
    await io.close();
    await queue.close();
    await Promise.allSettled([prisma.$disconnect(), redis.quit(), workerConnection.quit()]);
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  logger.error({ err }, "failed to start");
  process.exit(1);
});
