import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";

config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)), quiet: true });

const { createApp } = await import("./app");
const { getEnv } = await import("./config/env");
const { createRedis } = await import("./lib/redis");
const { logger } = await import("./lib/logger");

async function main() {
  const env = getEnv();
  const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
  const redis = createRedis(env.REDIS_URL);
  const db = { ping: async () => void (await pool.query("select 1")) };
  const httpServer = createServer(createApp({ db, redis, env }));

  httpServer.listen(env.PORT, () => logger.info(`server listening on :${env.PORT}`));

  const shutdown = async () => {
    logger.info("shutting down");
    httpServer.close();
    await Promise.allSettled([pool.end(), redis.quit()]);
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  logger.error({ err }, "failed to start");
  process.exit(1);
});
