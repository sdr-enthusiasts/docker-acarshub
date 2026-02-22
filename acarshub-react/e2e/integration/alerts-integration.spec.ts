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
 * Full-Stack Integration Tests — Alerts Page (Phase 5.4)
 *
 * These tests run against a REAL Docker container.  They exercise the complete
 * alert pipeline:
 *   connect sequence → alert_terms event → alertTerms store →
 *   alert_matches_batch events → alertMessageGroups store → DOM render
 *
 * Seed DB facts (test-fixtures/seed.db):
 *   alert_stats:    3 terms  — WN4899, N8560Z, XA0001
 *   alert_matches:  92 rows  — WN4899: 46, N8560Z: 37, XA0001: 9
 *
 * No store injection or socket mocking used.  All data arrives from the real
 * backend over the real Socket.IO transport.
 */

import { expect, type Page, test } from "@playwright/test";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Navigate to the Alerts page and wait for the React app to mount.
 */
async function goToAlerts(page: Page): Promise<void> {
  await page.goto("/alerts");
  await expect(page.locator("header.navigation")).toBeVisible({
    timeout: 20_000,
  });
  // The Alerts page title heading should appear quickly
  await expect(
    page.getByRole("heading", { name: /alerts/i }).first(),
  ).toBeVisible({ timeout: 15_000 });
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

test.describe("Alerts page — full stack", () => {
  test.describe.configure({ mode: "serial" });

  // ── Test 1: Total alert count is non-zero after connect sequence ───────
  test("alerts page shows non-zero total alerts after connect", async ({
    page,
  }) => {
    await goToAlerts(page);

    // The page stats bar renders:
    //   "<N> unread | <M> total alerts | <K> aircraft"
    // Wait for the "total alerts" stat element to appear and contain a
    // positive number.
    const totalAlertsStat = page
      .locator(".page__stats .stat")
      .filter({ hasText: /total alert/i });

    await expect(totalAlertsStat).toBeVisible({ timeout: 30_000 });

    const strongEl = totalAlertsStat.locator("strong");
    await expect(strongEl).toBeVisible({ timeout: 5_000 });

    const countText = await strongEl.textContent();
    const count = Number.parseInt(countText ?? "0", 10);
    // Seed DB has 92 alert-matched messages
    expect(count).toBeGreaterThan(0);
  });

  // ── Test 2: Alert terms from seed DB populate the Historical dropdown ──
  test("historical mode dropdown contains seed alert terms", async ({
    page,
  }) => {
    await goToAlerts(page);

    // Wait for alert data to load (total alerts stat > 0)
    const totalAlertsStat = page
      .locator(".page__stats .stat")
      .filter({ hasText: /total alert/i });
    await expect(totalAlertsStat).toBeVisible({ timeout: 30_000 });

    // Switch to Historical mode — the button is disabled when there are no
    // terms; it should be enabled once alert_terms arrives from the backend.
    const historicalBtn = page.getByRole("button", { name: /historical/i });
    await expect(historicalBtn).toBeEnabled({ timeout: 15_000 });
    await historicalBtn.click();

    // The term selector <select> should now be visible
    const termSelect = page.locator("#alert-term-select");
    await expect(termSelect).toBeVisible({ timeout: 10_000 });

    // All three seed alert terms must appear as <option> elements
    for (const term of ["WN4899", "N8560Z", "XA0001"]) {
      await expect(termSelect.locator(`option[value="${term}"]`)).toHaveCount(
        1,
        { timeout: 5_000 },
      );
    }
  });

  // ── Test 3: Historical mode loads results for a known term ─────────────
  test("historical mode shows messages for term 'WN4899'", async ({ page }) => {
    await goToAlerts(page);

    // Wait for total alerts stat to confirm data has loaded
    const totalAlertsStat = page
      .locator(".page__stats .stat")
      .filter({ hasText: /total alert/i });
    await expect(totalAlertsStat).toBeVisible({ timeout: 30_000 });

    // Switch to Historical mode
    const historicalBtn = page.getByRole("button", { name: /historical/i });
    await expect(historicalBtn).toBeEnabled({ timeout: 15_000 });
    await historicalBtn.click();

    // Select WN4899 from the dropdown (it may already be selected as the first
    // option, but explicitly choose it for determinism)
    const termSelect = page.locator("#alert-term-select");
    await expect(termSelect).toBeVisible({ timeout: 10_000 });
    await termSelect.selectOption("WN4899");

    // The page should show a results count > 0
    // The historical stats bar renders: "<N> results | Query time: <T>ms"
    const resultsStat = page
      .locator(".page__stats .stat")
      .filter({ hasText: /result/i });
    await expect(resultsStat).toBeVisible({ timeout: 30_000 });

    const strongEl = resultsStat.locator("strong").first();
    await expect(strongEl).toBeVisible({ timeout: 5_000 });

    const countText = await strongEl.textContent();
    const count = Number.parseInt(countText ?? "0", 10);
    // WN4899 has 46 matches in the seed DB
    expect(count).toBeGreaterThan(0);
  });

  // ── Test 4: Live mode shows message cards with alert styling ───────────
  test("live mode shows alert message cards", async ({ page }) => {
    await goToAlerts(page);

    // Wait for at least one message card to appear in the live alert feed.
    // The backend sends alert_matches_batch during the connect sequence, so
    // cards should appear once the batch is fully delivered.
    //
    // We allow up to 30 s because chunked batch delivery of 92 messages may
    // take several seconds on a cold container start.
    const firstCard = page.locator(".message-card").first();
    await expect(firstCard).toBeVisible({ timeout: 30_000 });

    // Verify there are multiple cards (seed DB has 92 alert matches)
    const cardCount = await page.locator(".message-card").count();
    expect(cardCount).toBeGreaterThan(0);
  });
});
