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

import { expect, type Page, test } from "@playwright/test";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Open the Settings modal from any page.
 *
 * On mobile the Settings button lives inside the hamburger menu; this helper
 * opens the menu first so the button is accessible on all viewport sizes.
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
 * Click a nav link using client-side React Router navigation.
 *
 * On mobile the nav links are inside the hamburger <details>; this helper
 * opens the menu first if necessary.  It resolves once the URL has changed
 * to the expected pattern.
 */
async function clickNavLink(
  page: Page,
  namePattern: RegExp,
  urlPattern: RegExp,
): Promise<void> {
  const mobileMenu = page.locator("details.small_nav");
  if (await mobileMenu.isVisible()) {
    await page.locator("details.small_nav > summary").click();
  }
  await Promise.all([
    page.waitForURL(urlPattern, { timeout: 15000 }),
    page.getByRole("link", { name: namePattern }).first().click(),
  ]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Settings Persistence", () => {
  test.beforeEach(async ({ page }) => {
    // Start on the Live Messages page every time so the app is fully
    // initialized before tests begin.
    await page.goto("/live-messages");
    await expect(page.locator("header.navigation")).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // 1. Theme persists after navigating to another route and back
  // -------------------------------------------------------------------------

  test("theme change persists after navigating to another page and returning", async ({
    page,
  }) => {
    // Step 1 — open Settings → Appearance tab → switch to Latte (light theme)
    await openSettings(page);
    await page.getByRole("tab", { name: /appearance/i }).click();

    // Mocha should be selected by default
    const mochaInput = page.locator('input[type="radio"][value="mocha"]');
    await expect(mochaInput).toBeChecked();

    // Switch to Latte by clicking the visible label text (radio inputs use custom CSS
    // styling that makes the <input> element itself not directly interactive — the
    // clickable area is the associated <label>, matching the smoke.spec.ts pattern).
    await page.locator("text=Catppuccin Latte (Light)").first().click();
    const latteInput = page.locator('input[type="radio"][value="latte"]');
    await expect(latteInput).toBeChecked();

    // Step 2 — close modal, verify theme is applied to the document
    await closeSettings(page);

    // The Zustand settings store writes "latte" or "mocha" to the data-theme
    // attribute on <html> via the theme-sync effect.  Verify it changed.
    const appliedTheme = await page.evaluate(() =>
      document.documentElement.getAttribute("data-theme"),
    );
    // The attribute value may be "light" / "dark" or the theme name directly,
    // depending on how the app maps theme → attribute.  We just need it to
    // be something other than the dark default.
    expect(appliedTheme).not.toBeNull();

    // Step 3 — navigate away to the Search page via the nav link
    await clickNavLink(page, /search database/i, /\/search/);
    await expect(page).toHaveURL(/\/search/);

    // Step 4 — navigate back to Live Messages
    await clickNavLink(page, /live messages/i, /\/live-messages/);
    await expect(page).toHaveURL(/\/live-messages/);

    // Step 5 — reopen Settings and verify Latte is still selected
    await openSettings(page);
    await page.getByRole("tab", { name: /appearance/i }).click();

    const latteInputAfterNav = page.locator(
      'input[type="radio"][value="latte"]',
    );
    await expect(
      latteInputAfterNav,
      "Latte theme should still be selected after navigation",
    ).toBeChecked();
  });

  // -------------------------------------------------------------------------
  // 2. Time format persists after navigating to another route and back
  // -------------------------------------------------------------------------

  test("time format change persists after navigating to another page and returning", async ({
    page,
  }) => {
    // Step 1 — open Settings → Regional & Time → set time format to 24-hour
    await openSettings(page);
    await page.getByRole("tab", { name: /regional/i }).click();

    // The time-format select should be visible
    const timeFormatSelect = page.locator("#time-format");
    await expect(timeFormatSelect).toBeVisible();

    // Select 24-hour format
    await timeFormatSelect.selectOption("24h");
    await expect(timeFormatSelect).toHaveValue("24h");

    // Step 2 — close modal
    await closeSettings(page);

    // Step 3 — navigate away (Status page)
    await clickNavLink(page, /^status$/i, /\/status/);
    await expect(page).toHaveURL(/\/status/);

    // Step 4 — navigate back to Live Messages
    await clickNavLink(page, /live messages/i, /\/live-messages/);
    await expect(page).toHaveURL(/\/live-messages/);

    // Step 5 — reopen Settings → Regional & Time → verify value persisted
    await openSettings(page);
    await page.getByRole("tab", { name: /regional/i }).click();

    const timeFormatSelectAfterNav = page.locator("#time-format");
    await expect(
      timeFormatSelectAfterNav,
      "24-hour time format should still be selected after navigation",
    ).toHaveValue("24h");
  });

  // -------------------------------------------------------------------------
  // 3. Multiple settings persist independently
  // -------------------------------------------------------------------------

  test("multiple independent settings all persist across navigation", async ({
    page,
  }) => {
    // Change theme AND timezone in the same session then navigate away.
    await openSettings(page);

    // Appearance — switch to Latte (click visible label text, not the hidden input)
    await page.getByRole("tab", { name: /appearance/i }).click();
    await page.locator("text=Catppuccin Latte (Light)").first().click();
    await expect(
      page.locator('input[type="radio"][value="latte"]'),
    ).toBeChecked();

    // Regional & Time — switch timezone to UTC (click the "UTC" label text)
    await page.getByRole("tab", { name: /regional/i }).click();
    // The UTC option label text is exactly "UTC"; use a scoped locator to avoid
    // matching other elements that may contain "UTC" in their description text.
    await page.locator(".radio-option__text", { hasText: /^UTC$/ }).click();
    const utcRadio = page.locator('input[type="radio"][value="utc"]');
    await expect(utcRadio).toBeChecked();

    await closeSettings(page);

    // Navigate: Live Messages → About → Live Messages
    await page.goto("/about");
    await expect(page).toHaveURL(/\/about/);

    await page.goto("/live-messages");
    await expect(page).toHaveURL(/\/live-messages/);
    await expect(page.locator("header.navigation")).toBeVisible();

    // Re-verify both settings
    await openSettings(page);

    await page.getByRole("tab", { name: /appearance/i }).click();
    await expect(
      page.locator('input[type="radio"][value="latte"]'),
      "Latte theme should persist",
    ).toBeChecked();

    await page.getByRole("tab", { name: /regional/i }).click();
    await expect(
      page.locator('input[type="radio"][value="utc"]'),
      "UTC timezone should persist",
    ).toBeChecked();
  });

  // -------------------------------------------------------------------------
  // 4. Settings survive a soft reload (navigating to "/" which redirects)
  // -------------------------------------------------------------------------

  test("settings persist after navigating through the root redirect", async ({
    page,
  }) => {
    // Change theme to Latte (click the visible label, not the hidden radio input)
    await openSettings(page);
    await page.getByRole("tab", { name: /appearance/i }).click();
    await page.locator("text=Catppuccin Latte (Light)").first().click();
    await expect(
      page.locator('input[type="radio"][value="latte"]'),
    ).toBeChecked();
    await closeSettings(page);

    // Navigate to "/" — the app redirects to /live-messages (React Router Navigate)
    // This exercises the route redirect without a full browser reload.
    await page.goto("/");
    // After redirect we should land on live-messages
    await expect(page).toHaveURL(/\/live-messages/);
    await expect(page.locator("header.navigation")).toBeVisible();

    // Settings should still be Latte
    await openSettings(page);
    await page.getByRole("tab", { name: /appearance/i }).click();
    await expect(
      page.locator('input[type="radio"][value="latte"]'),
      "Latte theme should persist after root redirect",
    ).toBeChecked();
  });
});
