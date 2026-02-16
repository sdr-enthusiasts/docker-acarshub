import { expect, type Page, test } from "@playwright/test";

/**
 * Test utility to inject decoder state into the app store
 * This ensures Live Map navigation is available in tests
 */
async function injectDecoderState(page: Page) {
  await page.evaluate(() => {
    // Wait for store to be available (it's exposed to window in dev/test mode)
    return new Promise<void>((resolve) => {
      const checkStore = () => {
        // biome-ignore lint/suspicious/noExplicitAny: Required for E2E testing window access
        const store = (window as any).__ACARS_STORE__;
        if (store) {
          store.getState().setDecoders({
            acars: true,
            vdlm: true,
            hfdl: true,
            imsl: false,
            irdm: false,
            allow_remote_updates: false,
            adsb: {
              enabled: true,
              lat: 0,
              lon: 0,
              range_rings: false,
            },
          });
          resolve();
        } else {
          // Store not ready yet, try again
          setTimeout(checkStore, 50);
        }
      };
      checkStore();
    });
  });
}

/**
 * Smoke tests - Basic E2E test suite to verify Playwright setup
 * and app initialization
 */

test.describe("Smoke Tests", () => {
  test("should load the application", async ({ page }) => {
    // Navigate to the app
    await page.goto("/");

    // Wait for navigation to be visible (core app element)
    await expect(page.locator("nav")).toBeVisible();

    // Verify page title
    await expect(page).toHaveTitle(/ACARS Hub/i);
  });

  test("should have navigation menu", async ({ page }) => {
    await page.goto("/");
    await injectDecoderState(page); // Enable all decoders including ADS-B

    // Check for navigation links
    await expect(
      page.getByRole("link", { name: /live messages/i }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /live map/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /search/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /alerts/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /statistics/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /about/i })).toBeVisible();
  });

  test("should navigate to different pages", async ({ page }) => {
    await page.goto("/");
    await injectDecoderState(page); // Enable all decoders including ADS-B

    // Navigate to About page
    await page.getByRole("link", { name: /about/i }).click();
    await expect(page).toHaveURL(/\/about/);

    // Navigate to Statistics page
    await page.getByRole("link", { name: /statistics/i }).click();
    await expect(page).toHaveURL(/\/stats/);

    // Navigate back to Live Messages
    await page.getByRole("link", { name: /live messages/i }).click();
    await expect(page).toHaveURL(/\//);
  });

  test("should open and close Settings modal", async ({ page }) => {
    await page.goto("/");

    // Settings button should be visible
    const settingsButton = page.getByRole("button", { name: /settings/i });
    await expect(settingsButton).toBeVisible();

    // Open settings
    await settingsButton.click();

    // Modal should appear
    await expect(page.getByRole("dialog")).toBeVisible();

    // Close modal with close button
    await page.getByRole("button", { name: /close/i }).click();

    // Modal should be hidden
    await expect(page.getByRole("dialog")).not.toBeVisible();
  });

  test("should show connection status", async ({ page }) => {
    await page.goto("/");

    // Connection status indicator should be present
    // (may be connected or disconnected depending on backend availability)
    const connectionStatus = page
      .locator('[class*="connection-status"]')
      .first();
    await expect(connectionStatus).toBeVisible();
  });

  test("should be responsive on mobile viewport", async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");

    // On mobile, navigation is in a details/summary element (hamburger menu)
    const mobileMenu = page.locator("details.show_when_small");
    await expect(mobileMenu).toBeVisible();

    // Content should be visible and not cause horizontal scroll
    const body = page.locator("body");
    const scrollWidth = await body.evaluate((el) => el.scrollWidth);
    const clientWidth = await body.evaluate((el) => el.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test("should switch themes", async ({ page }) => {
    await page.goto("/");

    // Open settings
    await page.getByRole("button", { name: /settings/i }).click();

    // Navigate to Appearance tab
    await page.getByRole("tab", { name: /appearance/i }).click();

    // Wait for theme section to be visible
    await page.waitForTimeout(500);

    // Find theme options by their text content (they're styled radio options)
    const _mochaOption = page.locator("text=Catppuccin Mocha (Dark)").first();
    const latteOption = page.locator("text=Catppuccin Latte (Light)").first();

    // Verify Mocha is selected by default (the radio input should be checked)
    const mochaInput = page.locator('input[type="radio"][value="mocha"]');
    await expect(mochaInput).toBeChecked();

    // Switch to Latte by clicking the visible option
    await latteOption.click();

    // Verify Latte is now selected
    const latteInput = page.locator('input[type="radio"][value="latte"]');
    await expect(latteInput).toBeChecked();

    // Close modal
    await page.getByRole("button", { name: /close/i }).click();

    // Theme should persist - reopen settings
    // Reopen settings
    await page.getByRole("button", { name: /settings/i }).click();
    await page.getByRole("tab", { name: /appearance/i }).click();

    // Latte should still be selected
    const latteInputReopen = page.locator('input[type="radio"][value="latte"]');
    await expect(latteInputReopen).toBeChecked();
  });
});
