import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    fileParallelism: false,
    globalSetup: ["src/__tests__/setup/global-setup.ts"],
    setupFiles: ["src/__tests__/setup/load-env.ts"],
  },
});
