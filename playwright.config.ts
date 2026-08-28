import { defineConfig, devices } from "@playwright/test";

/**
 * Session-specific artifact directories under /tmp keep concurrent Playwright
 * runs from colliding (FORGE-CONFIG session defaults).
 */
const ARTIFACT_ROOT = "/tmp/signal-loss-e2e";

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: `${ARTIFACT_ROOT}/results`,
  fullyParallel: true,
  forbidOnly: process.env.CI !== undefined,
  retries: process.env.CI !== undefined ? 1 : 0,
  ...(process.env.CI !== undefined ? { workers: 2 } : {}),
  reporter: [
    ["list"],
    ["html", { outputFolder: `${ARTIFACT_ROOT}/report`, open: "never" }],
  ],
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: {
    command: "npm run preview -- --host 127.0.0.1 --port 5173",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: process.env.CI === undefined,
    timeout: 120_000,
  },
});
