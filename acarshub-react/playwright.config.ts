import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for ACARS Hub E2E tests
 * See https://playwright.dev/docs/test-configuration
 *
 * Note: Uses Nix-provided browsers via PLAYWRIGHT_BROWSERS_PATH
 */
export default defineConfig({
  testDir: "./e2e",

  /* Run tests in files in parallel */
  fullyParallel: true,

  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,

  /* Allow up to 4 parallel workers in CI — enough to run all 5 browser projects
   * concurrently without overwhelming the vite preview server or CI runner.
   * Serial (workers=1) made multi-browser runs extremely slow: 7 tests × 5 browsers
   * × 3 retries each = 105 sequential test slots. */
  workers: process.env.CI ? 4 : undefined,

  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: "html",

  /* Global timeout for each test */
  timeout: 30 * 1000,

  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: "http://localhost:3000",

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: "on-first-retry",

    /* Screenshot on failure */
    screenshot: "only-on-failure",

    /* Run in headless mode by default */
    headless: true,

    /* Action timeout */
    actionTimeout: 10 * 1000,

    /* Use system-provided browsers from Nix */
    channel: undefined,
  },

  /* Configure projects for major browsers.
   *
   * On NixOS the Playwright-bundled Firefox and WebKit binaries are missing
   * required system libraries, so those projects are only enabled when running
   * inside the official Playwright Docker image (set PLAYWRIGHT_DOCKER=true).
   * The `test-e2e-docker` justfile target sets this automatically.
   */
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },

    ...(process.env.PLAYWRIGHT_DOCKER
      ? [
          {
            name: "firefox",
            use: { ...devices["Desktop Firefox"] },
          },
          {
            name: "webkit",
            use: { ...devices["Desktop Safari"] },
          },
          {
            name: "Mobile Chrome",
            use: { ...devices["Pixel 5"] },
          },
          {
            name: "Mobile Safari",
            use: { ...devices["iPhone 12"] },
          },
        ]
      : []),
  ],

  /* Run your local dev server before starting the tests */
  /* NOTE: Dev server must be started manually before running E2E tests */
  /* Run: npm run dev (in separate terminal) */
  /* Then: npm run test:e2e */
  /*
   * When running inside Docker (PLAYWRIGHT_DOCKER=true) or CI, serve the
   * pre-built static bundle via `vite preview` instead of the dev server.
   * The dev server handles every module request individually — with 16+
   * concurrent browser workers it gets overwhelmed and tests become flaky.
   * A built bundle is served as plain static files and handles concurrency
   * without issue.  The justfile targets build the app before starting the
   * container, so the dist/ directory is always present.
   */
  webServer:
    process.env.CI || process.env.PLAYWRIGHT_DOCKER
      ? {
          command: "npx vite preview --port 3000 --strictPort",
          url: "http://localhost:3000",
          reuseExistingServer: true,
          timeout: 60 * 1000,
          stdout: "ignore",
          stderr: "pipe",
        }
      : undefined,
});
