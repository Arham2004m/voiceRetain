import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    fileParallelism: false,
    setupFiles: ["src/__tests__/setup/load-env.ts"],
  },
});
