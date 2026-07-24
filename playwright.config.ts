import { defineConfig, devices } from "@playwright/test";

const externalBaseURL = process.env.PLAYWRIGHT_BASE_URL;
const localBaseURL = "http://127.0.0.1:3100";
const requireLiveAfroTools = process.env.REQUIRE_LIVE_AFROTOOLS === "true";

if (!externalBaseURL) process.env.PLAYWRIGHT_BASE_URL = localBaseURL;

/**
 * The production acceptance suite asserts against a real deployment with real
 * data and never skips. It must NOT run in the env-less CI browser-journeys
 * job, where there is no data by design — it is opted into explicitly by the
 * production-acceptance workflow.
 */
const runProductionAcceptance =
  process.env.PRODUCTION_ACCEPTANCE === "true" ||
  process.env.PLAYWRIGHT_SUITE === "production";

export default defineConfig({
  testDir: "./tests/e2e",
  // Production acceptance drives several real routes per test over the public
  // network, each waiting for streamed content to settle. The 30s default is
  // enough locally but not on a slower CI runner, so the opted-in production
  // run gets a realistic budget rather than flaky failures.
  ...(runProductionAcceptance ? { timeout: 120_000 } : {}),
  testIgnore: runProductionAcceptance
    ? []
    : ["**/production-acceptance.spec.ts"],
  outputDir: "./output/playwright/results",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 3,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: externalBaseURL ?? localBaseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "mobile-360",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 360, height: 800 },
      },
    },
    {
      name: "tablet-768",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 768, height: 1024 },
      },
    },
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: externalBaseURL
    ? undefined
    : {
        command: process.env.CI
          ? "npm run start -- --hostname 127.0.0.1 --port 3100"
          : "npm run dev -- --hostname 127.0.0.1 --port 3100",
        url: localBaseURL,
        // Reusing an arbitrary listener can run this suite against a different
        // local Next app. A collision must fail visibly instead.
        reuseExistingServer: false,
        env: {
          ...process.env,
          ...(requireLiveAfroTools ? {} : { AFROTOOLS_API_KEY: "" }),
          NEXT_PUBLIC_APP_URL: localBaseURL,
          SALARYPADI_LOCAL_E2E: process.env.CI ? "true" : "false",
        },
      },
});
