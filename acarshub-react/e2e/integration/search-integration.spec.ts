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
 * Full-Stack Integration Tests — Search Page (Phase 5.4)
 *
 * These tests run against a REAL Docker container.  They exercise the full
 * search pipeline:
 *   browser form submit → Socket.IO query_search → Node.js handler
 *     → SQLite query → enrichMessage → database_search_results → DOM render
 *
 * Seed DB facts (test-fixtures/seed.db):
 *   - known flight:    WN4899   (≥ 1 result)
 *   - known tail:      N8560Z   (≥ 1 result)
 *   - known station:   CS-KABQ-ACARS (≥ 1 result)
 *   - total messages:  1,144
 *
 * No store injection or socket mocking used — all interactions go through the
 * real UI and real Socket.IO transport.
 */

import { expect, type Page, test } from "@playwright/test";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Navigate to the Search page and wait for it to be interactive.
 * Returns when the Flight input field is visible and ready.
 */
async function goToSearch(page: Page): Promise<void> {
  await page.goto("/search");
  // Wait for the navigation header — confirms React has mounted
  await expect(page.locator("header.navigation")).toBeVisible({
    timeout: 20_000,
  });
  // Wait for the search form's Flight input to appear
  await expect(page.locator("#search-flight")).toBeVisible({ timeout: 15_000 });
}

/**
 * Fill a single search field, submit the form, and wait for results to appear.
 *
 * Clears any previous value, types the new value, then clicks Submit.
 * Returns when either:
 *   - at least one `.message-card` is visible in the results, OR
 *   - the "no results" empty-state text appears.
 *
 * @param page       Playwright page
 * @param fieldId    The `id` attribute of the input (e.g. "search-flight")
 * @param value      Value to type
 * @param timeout    Max wait for results (default 30 s)
 */
async function searchBy(
  page: Page,
  fieldId: string,
  value: string,
  timeout = 30_000,
): Promise<void> {
  // Clear ALL fields first so previous test state does not bleed through
  for (const id of [
    "search-flight",
    "search-tail",
    "search-icao",
    "search-depa",
    "search-dsta",
    "search-freq",
    "search-label",
    "search-msgno",
    "search-station",
    "search-text",
  ]) {
    await page.locator(`#${id}`).fill("");
  }
  // Reset the Decoder Type select to "All"
  await page.locator("#search-msg-type").selectOption("");

  // Fill the target field
  await page.locator(`#${fieldId}`).fill(value);

  // Submit
  await page.locator('button[type="submit"]').click();

  // Wait for results OR empty state
  await expect(
    page
      .locator(".message-card")
      .first()
      .or(page.locator(".search-page__empty-state"))
      .or(page.locator('[class*="empty"]')),
  ).toBeVisible({ timeout });
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

test.describe("Search page — full stack", () => {
  test.describe.configure({ mode: "serial" });

  // ── Test 1: Search by flight returns results ───────────────────────────
  test("search by flight 'WN4899' returns at least one result", async ({
    page,
  }) => {
    await goToSearch(page);
    await searchBy(page, "search-flight", "WN4899");

    // At least one message card must be visible
    const firstCard = page.locator(".message-card").first();
    await expect(firstCard).toBeVisible({ timeout: 5_000 });

    // The result count text should show > 0 results
    const resultCount = page.locator('[class*="result"]').filter({
      hasText: /\d+ result/i,
    });
    if (await resultCount.isVisible({ timeout: 3_000 })) {
      const text = await resultCount.textContent();
      const match = (text ?? "").match(/(\d+)\s+result/i);
      if (match) {
        expect(Number.parseInt(match[1], 10)).toBeGreaterThan(0);
      }
    }
  });

  // ── Test 2: Search by tail returns results ─────────────────────────────
  test("search by tail 'N8560Z' returns at least one result", async ({
    page,
  }) => {
    await goToSearch(page);
    await searchBy(page, "search-tail", "N8560Z");

    const firstCard = page.locator(".message-card").first();
    await expect(firstCard).toBeVisible({ timeout: 5_000 });
  });

  // ── Test 3: Empty search returns all messages ──────────────────────────
  test("empty search returns results (show_all path)", async ({ page }) => {
    await goToSearch(page);

    // Submit with all fields empty — triggers show_all=true in the handler
    await page.locator('button[type="submit"]').click();

    // With 1 144 messages in the seed DB the first page (50 results) should
    // load quickly.
    const firstCard = page.locator(".message-card").first();
    await expect(firstCard).toBeVisible({ timeout: 30_000 });

    // There should be multiple cards (up to the per-page limit of 50)
    const cardCount = await page.locator(".message-card").count();
    expect(cardCount).toBeGreaterThan(1);
  });

  // ── Test 4: Search by station ID returns results ───────────────────────
  test("search by station 'CS-KABQ-ACARS' returns at least one result", async ({
    page,
  }) => {
    await goToSearch(page);
    await searchBy(page, "search-station", "CS-KABQ-ACARS");

    const firstCard = page.locator(".message-card").first();
    await expect(firstCard).toBeVisible({ timeout: 5_000 });
  });

  // ── Test 5: Search by VDLM2 decoder type returns results ──────────────
  test("search by decoder type 'VDLM2' returns results", async ({ page }) => {
    await goToSearch(page);

    // Clear all text fields
    for (const id of [
      "search-flight",
      "search-tail",
      "search-icao",
      "search-depa",
      "search-dsta",
      "search-freq",
      "search-label",
      "search-msgno",
      "search-station",
      "search-text",
    ]) {
      await page.locator(`#${id}`).fill("");
    }

    // Select VDLM2 decoder type
    await page.locator("#search-msg-type").selectOption("VDLM2");

    // Submit
    await page.locator('button[type="submit"]').click();

    // Seed DB has 226 VDL-M2 messages — first card should load quickly
    const firstCard = page.locator(".message-card").first();
    await expect(firstCard).toBeVisible({ timeout: 30_000 });
  });

  // ── Test 6: Search results show enriched field names ──────────────────
  test("search results display valid content (no raw DB field names)", async ({
    page,
  }) => {
    await goToSearch(page);
    await searchBy(page, "search-flight", "WN4899");

    const firstCard = page.locator(".message-card").first();
    await expect(firstCard).toBeVisible({ timeout: 5_000 });

    // The card should NOT contain raw DB column names that should have been
    // enriched away by the backend.
    const cardHtml = await firstCard.innerHTML();
    expect(cardHtml).not.toContain("msg_text");
    expect(cardHtml).not.toContain('"time"');
    expect(cardHtml).not.toContain("messageType");
    expect(cardHtml).not.toContain("stationId");
  });
});
