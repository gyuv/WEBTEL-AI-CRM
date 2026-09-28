import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 30000,
    globalSetup: ["tests/global-setup.ts"],
    setupFiles: ["tests/setup.ts"],
  },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
