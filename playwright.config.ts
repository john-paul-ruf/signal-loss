import { defineConfig, devices } from "@playwright/test";

const DEFAULT_PORT = 5173;
const rawPort = process.env.PORT;
const port = rawPort === undefined ? DEFAULT_PORT : Number(rawPort);

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error(
    `Invalid PORT ${JSON.stringify(rawPort)}: expected an integer from 1 to 65535.`,
  );
}

const serverUrl = `http://127.0.0.1:${port}`;
const artifactRoot =
  process.env.E2E_ARTIFACT_ROOT ?? "/tmp/signal-loss-e2e";
const isCi = process.env.CI !== undefined;

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: `${artifactRoot}/results`,
  fullyParallel: true,
  forbidOnly: isCi,
  retries: isCi ? 1 : 0,
  ...(isCi ? { workers: 2 } : {}),
  reporter: [
    ["list"],
    ["html", { outputFolder: `${artifactRoot}/report`, open: "never" }],
  ],
  use: {
    baseURL: serverUrl,
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
    command: `npm run preview -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: serverUrl,
    reuseExistingServer: !isCi && rawPort === undefined,
    timeout: 120_000,
  },
});
