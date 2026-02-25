// Copyright (C) 2022-2026 Frederick Clausen II
// This file is part of acarshub <https://github.com/sdr-enthusiasts/docker-acarshub>.

// acarshub is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// acarshub is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with acarshub.  If not, see <http://www.gnu.org/licenses/>.

import { expect, type Locator, type Page, test } from "@playwright/test";

// ---------------------------------------------------------------------------
// Fixed timestamps used across all tests
//
// Using known UTC instants keeps every assertion deterministic regardless of
// which machine or CI environment runs the suite.
//
//   TS_20H_UTC  = 2024-01-01 20:00:00 UTC  (good for time-format / tz tests)
//   TS_FEB_UTC  = 2024-02-01 00:00:00 UTC  (unambiguous date for date-format tests)
// ---------------------------------------------------------------------------

const TS_20H_UTC = 1_704_139_200; // seconds — 2024-01-01T20:00:00Z
const TS_FEB_UTC = 1_706_745_600; // seconds — 2024-02-01T00:00:00Z

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MinimalAcarsMsg {
  uid: string;
  message_type: string;
  timestamp: number;
  station_id: string;
  flight?: string;
  text?: string;
  label?: string;
  matched?: boolean;
  matched_text?: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Inject a message directly into the Zustand app store via the E2E window
 * handle.  The store must have been built with VITE_E2E=true; returns false
 * when the handle is not present within five seconds.
 */
async function injectMessage(
  page: Page,
  msg: MinimalAcarsMsg,
): Promise<boolean> {
  return page.evaluate((message) => {
    return new Promise<boolean>((resolve) => {
      const deadline = Date.now() + 5_000;

      const tryInject = () => {
        // biome-ignore lint/suspicious/noExplicitAny: Required for E2E testing window access
        const store = (window as any).__ACARS_STORE__;
        if (store) {
          store.getState().addMessage(message);
          resolve(true);
        } else if (Date.now() >= deadline) {
          resolve(false);
        } else {
          setTimeout(tryInject, 50);
        }
      };

      tryInject();
    });
  }, msg);
}

/**
 * Open the Settings modal from any page.
 *
 * On mobile the Settings button is inside the hamburger menu; this helper
 * opens the menu first so the button is reachable on all viewport sizes.
 */
async function openSettings(page: Page): Promise<void> {
  const mobileMenu = page.locator("details.small_nav");
  if (await mobileMenu.isVisible()) {
    await page.locator("details.small_nav > summary").click();
  }
  await page.getByRole("button", { name: /settings/i }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

/**
 * Close the Settings modal by pressing Escape.
 */
async function closeSettings(page: Page): Promise<void> {
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
}

/**
 * Open Settings and switch to the "Regional & Time" tab.
 * Leaves the modal open so callers can make further changes.
 */
async function openSettingsRegional(page: Page): Promise<void> {
  await openSettings(page);
  await page.getByRole("tab", { name: /regional/i }).click();
}

/**
 * Select a value from the time-format <select> element.
 * Assumes the Regional & Time panel is already active.
 */
async function setTimeFormat(
  page: Page,
  value: "12h" | "24h" | "auto",
): Promise<void> {
  const select = page.locator("#time-format");
  await select.selectOption(value);
  await expect(select).toHaveValue(value);
}

/**
 * Select a value from the date-format <select> element.
 * Assumes the Regional & Time panel is already active.
 */
async function setDateFormat(
  page: Page,
  value: "mdy" | "dmy" | "ymd" | "long" | "short" | "auto",
): Promise<void> {
  const select = page.locator("#date-format");
  await select.selectOption(value);
  await expect(select).toHaveValue(value);
}

/**
 * Click the "UTC" radio label to select the UTC timezone.
 * Assumes the Regional & Time panel is already active.
 */
async function selectTimezoneUTC(page: Page): Promise<void> {
  // The radio inputs use a custom CSS style that hides the <input> element;
  // the clickable surface is the associated label text (same pattern as the
  // theme radio buttons in settings-persistence.spec.ts).
  await page.locator(".radio-option__text", { hasText: /^UTC$/ }).click();
  await expect(page.locator('input[type="radio"][value="utc"]')).toBeChecked();
}

/**
 * Click the "Local Time" radio label to select the local timezone.
 * Assumes the Regional & Time panel is already active.
 */
async function selectTimezoneLocal(page: Page): Promise<void> {
  await page
    .locator(".radio-option__text", { hasText: /^Local Time$/ })
    .click();
  await expect(
    page.locator('input[type="radio"][value="local"]'),
  ).toBeChecked();
}

/**
 * Return a locator for the first message-card timestamp element.
 * This is the rendered output of formatTimestamp() inside MessageCard.
 */
function firstTimestamp(page: Page): Locator {
  return page.locator(".message-card__timestamp").first();
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

test.describe("Locale and Timezone Display (GAP-E2E-11)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/live-messages");
    await expect(page.locator("header.navigation")).toBeVisible();
  });

  // =========================================================================
  // 1. Time format — 12 h / 24 h
  //
  // Use a fixed timestamp of 20:00:00 UTC.  By also setting the app timezone
  // to UTC we guarantee the hour shown on screen is always 20 in 24h mode or
  // "8 PM" in 12h mode regardless of the CI runner's system timezone.
  // =========================================================================

  test.describe("Time format display", () => {
    test("24-hour format shows hours without AM/PM indicator", async ({
      page,
    }) => {
      const injected = await injectMessage(page, {
        uid: "e2e-locale-24h",
        message_type: "ACARS",
        timestamp: TS_20H_UTC,
        station_id: "E2E-LOCALE",
        flight: "LCL001",
        text: "Time format test — 24h",
        label: "H1",
        matched: false,
        matched_text: [],
      });
      expect(injected, "store injection requires VITE_E2E=true build").toBe(
        true,
      );

      // Configure: UTC timezone + 24-hour clock
      await openSettingsRegional(page);
      await selectTimezoneUTC(page);
      await setTimeFormat(page, "24h");
      await closeSettings(page);

      // 20:00:00 UTC in 24h format must contain "20:"
      const ts = firstTimestamp(page);
      await expect(ts).toBeVisible();
      await expect(ts).toContainText("20:");

      // Must not contain AM or PM markers
      const text = await ts.textContent();
      expect(text).not.toMatch(/AM|PM/i);
    });

    test("12-hour format shows PM indicator for 20:00 UTC", async ({
      page,
    }) => {
      const injected = await injectMessage(page, {
        uid: "e2e-locale-12h",
        message_type: "ACARS",
        timestamp: TS_20H_UTC,
        station_id: "E2E-LOCALE",
        flight: "LCL002",
        text: "Time format test — 12h",
        label: "H1",
        matched: false,
        matched_text: [],
      });
      expect(injected, "store injection requires VITE_E2E=true build").toBe(
        true,
      );

      // Configure: UTC timezone + 12-hour clock
      await openSettingsRegional(page);
      await selectTimezoneUTC(page);
      await setTimeFormat(page, "12h");
      await closeSettings(page);

      // 20:00 UTC in 12h format → "8:00:00 PM"
      const ts = firstTimestamp(page);
      await expect(ts).toBeVisible();
      await expect(ts).toContainText("PM");

      // Must not show the 24-hour "20:" representation
      const text = await ts.textContent();
      expect(text).not.toMatch(/\b20:/);
    });

    test("switching from 24h to 12h immediately updates displayed timestamp", async ({
      page,
    }) => {
      const injected = await injectMessage(page, {
        uid: "e2e-locale-switch-fmt",
        message_type: "ACARS",
        timestamp: TS_20H_UTC,
        station_id: "E2E-LOCALE",
        flight: "LCL003",
        text: "Time format switch test",
        label: "H1",
        matched: false,
        matched_text: [],
      });
      expect(injected).toBe(true);

      // Step 1 — start with 24h + UTC
      await openSettingsRegional(page);
      await selectTimezoneUTC(page);
      await setTimeFormat(page, "24h");
      await closeSettings(page);

      const ts = firstTimestamp(page);
      await expect(ts).toBeVisible();
      await expect(ts).toContainText("20:");

      // Step 2 — switch to 12h; the MessageCard subscribes to the settings
      // store and re-renders reactively, so no page reload is needed.
      await openSettingsRegional(page);
      await setTimeFormat(page, "12h");
      await closeSettings(page);

      // Playwright auto-retries until PM appears
      await expect(ts).toContainText("PM");

      // The 24h representation should have disappeared
      const text = await ts.textContent();
      expect(text).not.toMatch(/\b20:/);
    });
  });

  // =========================================================================
  // 2. Timezone display — UTC vs local (America/New_York)
  //
  // Playwright's test.use({ timezoneId }) sets the browser's "local" timezone
  // for this describe block.  America/New_York is UTC-5 in January (EST), so:
  //
  //   2024-01-01 20:00:00 UTC  →  2024-01-01 15:00:00 EST
  //
  // With 24h format selected, UTC mode must show "20:" and local mode "15:".
  // =========================================================================

  test.describe("Timezone display (America/New_York context)", () => {
    // Override the browser's local timezone so the UTC vs local comparison
    // is deterministic regardless of the CI host's system timezone.
    test.use({ timezoneId: "America/New_York" });

    test("UTC mode shows the UTC hour (20:) regardless of browser timezone", async ({
      page,
    }) => {
      const injected = await injectMessage(page, {
        uid: "e2e-tz-utc",
        message_type: "ACARS",
        timestamp: TS_20H_UTC,
        station_id: "E2E-TZ",
        flight: "TZ001",
        text: "Timezone — UTC mode",
        label: "H1",
        matched: false,
        matched_text: [],
      });
      expect(injected).toBe(true);

      // Configure: UTC timezone + 24h (unambiguous hour digits)
      await openSettingsRegional(page);
      await selectTimezoneUTC(page);
      await setTimeFormat(page, "24h");
      await closeSettings(page);

      const ts = firstTimestamp(page);
      await expect(ts).toBeVisible();
      // 20:00:00 UTC must be displayed as "20:…"
      await expect(ts).toContainText("20:");
    });

    test("local mode shows browser-local time (15: for America/New_York in January)", async ({
      page,
    }) => {
      const injected = await injectMessage(page, {
        uid: "e2e-tz-local",
        message_type: "ACARS",
        timestamp: TS_20H_UTC,
        station_id: "E2E-TZ",
        flight: "TZ002",
        text: "Timezone — local mode",
        label: "H1",
        matched: false,
        matched_text: [],
      });
      expect(injected).toBe(true);

      // Configure: local timezone + 24h
      await openSettingsRegional(page);
      await selectTimezoneLocal(page);
      await setTimeFormat(page, "24h");
      await closeSettings(page);

      const ts = firstTimestamp(page);
      await expect(ts).toBeVisible();
      // 20:00:00 UTC → 15:00:00 EST (America/New_York, UTC-5 in January)
      await expect(ts).toContainText("15:");

      // Must not show the UTC representation
      const text = await ts.textContent();
      expect(text).not.toMatch(/\b20:/);
    });

    test("switching timezone from UTC to local immediately updates displayed timestamp", async ({
      page,
    }) => {
      const injected = await injectMessage(page, {
        uid: "e2e-tz-switch",
        message_type: "ACARS",
        timestamp: TS_20H_UTC,
        station_id: "E2E-TZ",
        flight: "TZ003",
        text: "Timezone switch test",
        label: "H1",
        matched: false,
        matched_text: [],
      });
      expect(injected).toBe(true);

      // Step 1 — start with UTC + 24h; verify 20: is shown
      await openSettingsRegional(page);
      await selectTimezoneUTC(page);
      await setTimeFormat(page, "24h");
      await closeSettings(page);

      const ts = firstTimestamp(page);
      await expect(ts).toBeVisible();
      await expect(ts).toContainText("20:");

      // Step 2 — switch to local (America/New_York = UTC-5)
      await openSettingsRegional(page);
      await selectTimezoneLocal(page);
      await closeSettings(page);

      // MessageCard re-renders reactively; auto-retry until 15: appears
      await expect(ts).toContainText("15:");

      // 20: should no longer be present
      const text = await ts.textContent();
      expect(text).not.toMatch(/\b20:/);
    });
  });

  // =========================================================================
  // 3. Date format display
  //
  // Inject a message at 2024-02-01 00:00:00 UTC and use UTC timezone so the
  // displayed date is always Feb 1 2024, unambiguously 02/01.
  //
  //   ymd  →  2024-02-01
  //   mdy  →  02/01/2024   (MM/DD/YYYY — US order)
  //   dmy  →  01/02/2024   (DD/MM/YYYY — European order)
  //
  // The month (02) and day (01) are intentionally different so mdy and dmy
  // are visually distinct even though they use the same digit characters.
  // =========================================================================

  test.describe("Date format display", () => {
    test("ymd format shows ISO date (YYYY-MM-DD)", async ({ page }) => {
      const injected = await injectMessage(page, {
        uid: "e2e-date-ymd",
        message_type: "ACARS",
        timestamp: TS_FEB_UTC,
        station_id: "E2E-DATE",
        flight: "DT001",
        text: "Date format test — ymd",
        label: "H1",
        matched: false,
        matched_text: [],
      });
      expect(injected).toBe(true);

      await openSettingsRegional(page);
      await selectTimezoneUTC(page);
      await setDateFormat(page, "ymd");
      await closeSettings(page);

      const ts = firstTimestamp(page);
      await expect(ts).toBeVisible();
      // "2024-02-01, HH:MM:SS"
      await expect(ts).toContainText("2024-02-01");
    });

    test("mdy format shows US date (MM/DD/YYYY)", async ({ page }) => {
      const injected = await injectMessage(page, {
        uid: "e2e-date-mdy",
        message_type: "ACARS",
        timestamp: TS_FEB_UTC,
        station_id: "E2E-DATE",
        flight: "DT002",
        text: "Date format test — mdy",
        label: "H1",
        matched: false,
        matched_text: [],
      });
      expect(injected).toBe(true);

      await openSettingsRegional(page);
      await selectTimezoneUTC(page);
      await setDateFormat(page, "mdy");
      await closeSettings(page);

      const ts = firstTimestamp(page);
      await expect(ts).toBeVisible();
      // "02/01/2024, HH:MM:SS"
      await expect(ts).toContainText("02/01/2024");
    });

    test("dmy format shows European date (DD/MM/YYYY)", async ({ page }) => {
      const injected = await injectMessage(page, {
        uid: "e2e-date-dmy",
        message_type: "ACARS",
        timestamp: TS_FEB_UTC,
        station_id: "E2E-DATE",
        flight: "DT003",
        text: "Date format test — dmy",
        label: "H1",
        matched: false,
        matched_text: [],
      });
      expect(injected).toBe(true);

      await openSettingsRegional(page);
      await selectTimezoneUTC(page);
      await setDateFormat(page, "dmy");
      await closeSettings(page);

      const ts = firstTimestamp(page);
      await expect(ts).toBeVisible();
      // "01/02/2024, HH:MM:SS"
      await expect(ts).toContainText("01/02/2024");
    });

    test("switching date format immediately updates displayed timestamp", async ({
      page,
    }) => {
      const injected = await injectMessage(page, {
        uid: "e2e-date-switch",
        message_type: "ACARS",
        timestamp: TS_FEB_UTC,
        station_id: "E2E-DATE",
        flight: "DT004",
        text: "Date format switch test",
        label: "H1",
        matched: false,
        matched_text: [],
      });
      expect(injected).toBe(true);

      // Start with ISO (ymd) + UTC
      await openSettingsRegional(page);
      await selectTimezoneUTC(page);
      await setDateFormat(page, "ymd");
      await closeSettings(page);

      const ts = firstTimestamp(page);
      await expect(ts).toBeVisible();
      await expect(ts).toContainText("2024-02-01");

      // Switch to US (mdy) — should update reactively
      await openSettingsRegional(page);
      await setDateFormat(page, "mdy");
      await closeSettings(page);

      await expect(ts).toContainText("02/01/2024");

      // ISO format must no longer be visible
      const text = await ts.textContent();
      expect(text).not.toContain("2024-02-01");
    });
  });
});
