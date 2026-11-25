import { defineConfig, devices } from "@playwright/test";

/**
 * Manual end-to-end checkout suite. Not part of CI or the Vercel build.
 * Run with `npm run test:e2e:checkout` after setting E2E_BASE_URL.
 * See e2e/README.md for the environment variables.
 */
const baseURL = (process.env.E2E_BASE_URL ?? "").trim().replace(/\/+$/, "");
const chromeChannel = (process.env.E2E_BROWSER_CHANNEL ?? "").trim();
const chromePath = (process.env.E2E_CHROME_PATH ?? "").trim();

export default defineConfig({
  testDir: "./checkout",
  // Each test walks the whole 10-step Design Studio against a live deployment.
  timeout: 240_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: [["list"], ["html", { open: "never", outputFolder: "../playwright-report/e2e-checkout" }]],
  outputDir: "../test-results/e2e-checkout",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: baseURL || undefined,
    viewport: { width: 1366, height: 900 },
    locale: "en-GB",
    timezoneId: "Europe/Amsterdam",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Video needs Playwright's ffmpeg (`npx playwright install ffmpeg`); opt in with E2E_VIDEO=1.
    video: process.env.E2E_VIDEO === "1" ? "retain-on-failure" : "off",
    ...(chromeChannel ? { channel: chromeChannel } : {}),
    ...(chromePath ? { launchOptions: { executablePath: chromePath } } : {}),
  },
});
