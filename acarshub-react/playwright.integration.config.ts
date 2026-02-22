// Copyright (C) 2022-2026 Frederick Clausen II
// This file is part of acarshub <https://github.com/sdr-enthusiasts/docker-acarshub>.
//
// acarshub is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// acarshub is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with acarshub.  If not, see <http://www.gnu.org/licenses/>.

/**
 * Playwright configuration for full-stack integration E2E tests.
 *
 * Unlike the main playwright.config.ts (which tests the frontend against a
 * mocked/injected Socket.IO store), this configuration runs tests against a
 * REAL Docker container: nginx + Node.js backend + seed SQLite database.
 *
 * Key differences from playwright.config.ts:
 *  - `baseURL` comes from INTEGRATION_BASE_URL env var (set by docker-compose.test.yml
 *    to "http://backend"; defaults to "http://localhost:3001" for local runs).
 *  - Single browser project (Chromium only) — integration tests exercise the
 *    full data path, not browser-specific rendering quirks.
 *  - No `webServer` block — the backend container handles all serving.
 *  - Longer per-test timeout (60 s) because the real Socket.IO connect
 *    sequence includes DB queries, enrichment, and chunked batch delivery.
 *  - `testDir` points at `./e2e/integration/` (separate from the
 *    frontend-only suite in `./e2e/`).
 *  - `retries: 1` in CI — integration tests can be flakier due to timing.
 *
 * Usage (Docker Compose, via justfile):
 *   just build-test-image
 *   just test-e2e-fullstack
 *
 * Usage (local manual run, requires `ah:test` running on port 3001):
 *   cd acarshub-react
 *   INTEGRATION_BASE_URL=http://localhost:3001 \
 *     npx playwright test e2e/integration/ --config playwright.integration.config.ts
 */

import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env.INTEGRATION_BASE_URL ?? "http://localhost:3001";

export default defineConfig({
  testDir: "./e2e/integration",

  /* Run tests in files sequentially within a file, files in parallel */
  fullyParallel: false,

  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,

  /* Retry once in CI — real network / container timing can cause occasional
   * flakiness that a single retry clears. */
  retries: process.env.CI ? 1 : 0,

  /* Single worker for integration tests — shared backend container cannot
   * handle concurrent heavy Socket.IO connect sequences reliably. */
  workers: 1,

  /* HTML reporter (always) plus line reporter for CI readability. */
  reporter: process.env.CI
    ? [["html", { open: "never" }], ["line"]]
    : [["html"]],

  /* Per-test timeout is longer than the frontend-only suite because the real
   * Socket.IO connect sequence involves DB queries + enrichment + chunked
   * batch delivery (typically 2–6 s on first connect with seed DB). */
  timeout: 60 * 1000,

  use: {
    baseURL: BASE_URL,

    /* Collect trace on retry so failures are diagnosable without re-running. */
    trace: "on-first-retry",

    /* Screenshot on failure. */
    screenshot: "only-on-failure",

    /* Headless — integration tests run in CI containers. */
    headless: true,

    /* Navigation timeout: allow up to 30 s for the page to become interactive.
     * The backend may need a moment to warm up even after the healthcheck passes. */
    navigationTimeout: 30 * 1000,

    /* Action timeout: allow 15 s for individual page interactions. */
    actionTimeout: 15 * 1000,
  },

  /* Single browser project.  Integration tests validate the full data path
   * (DB → enrichment → Socket.IO → React store → DOM), not browser rendering. */
  projects: [
    {
      name: "integration-chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  /* No webServer block — the Docker Compose backend container handles serving. */
});
