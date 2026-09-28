import { defineConfig } from "@playwright/test";

const port = 3200;
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  workers: 1,
  use: {
    baseURL: `http://localhost:${port}`,
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : undefined,
  },
  webServer: {
    command: `rm -rf .data/e2e && next dev -p ${port}`,
    url: `http://localhost:${port}/dashboard`,
    timeout: 180_000,
    reuseExistingServer: false,
    env: { PGLITE_DIR: ".data/e2e", MOCK_MODE: "true", DATABASE_URL: "" },
  },
});
