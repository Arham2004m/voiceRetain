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

async function main() {
  const env = getEnv();
  const prisma = createPrisma(env.DATABASE_URL);
  const redis = createRedis(env.REDIS_URL);
  const queue = createAbandonmentQueue(redis);
  const workerConnection = createRedis(env.REDIS_URL, { forBullMQ: true });
  const worker = startAbandonmentWorker({
    db: prisma,
    connection: workerConnection,
    // Replaced by CallService.startCall in Stage 4.
    startCall: async (cartId) => {
      logger.info({ cartId }, "startCall (stub): would ring the customer's phone");
    },
  });

  const httpServer = createServer(createApp({ prisma, redis, queue, env }));
  httpServer.listen(env.PORT, () => logger.info(`server listening on :${env.PORT}`));

  const shutdown = async () => {
    logger.info("shutting down");
    httpServer.close();
    await worker.close();
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
