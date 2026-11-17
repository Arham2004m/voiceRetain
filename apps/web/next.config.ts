import path from "node:path";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

// One .env at the repo root serves both apps; Next only looks in its own folder by default.
loadEnvConfig(path.resolve(process.cwd(), "../.."));

const config: NextConfig = {
  transpilePackages: ["@voiceretain/shared"],
};

export default config;
