import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

export default function setup() {
  config({ path: fileURLToPath(new URL("../../../../../.env", import.meta.url)), quiet: true });
  // SKIP_DB_RESET=1 reuses the already-migrated test database (tables are still truncated
  // before every test). Useful where `prisma migrate reset` is not allowed to run.
  if (process.env.SKIP_DB_RESET === "1") return;
  const testUrl = process.env.DATABASE_URL_TEST;
  if (!testUrl) throw new Error("DATABASE_URL_TEST is required to run server tests");
  execSync("npx prisma migrate reset --force", {
    cwd: fileURLToPath(new URL("../../../", import.meta.url)),
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: "pipe",
    encoding: "utf8",
  });
}
