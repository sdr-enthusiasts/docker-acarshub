import { expect, type Page, test } from "@playwright/test";

/**
 * Test utility to inject decoder state into the app store
 * This ensures Live Map navigation is available in tests
 */
async function injectDecoderState(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    // Wait for store to be available (it's exposed in dev/test/E2E builds via VITE_E2E=true).
    // Times out after 5 seconds — if the store isn't on window (e.g. a non-E2E production
    // build) we resolve false instead of hanging for the full 30-second test timeout.
    return new Promise<boolean>((resolve) => {
      const deadline = Date.now() + 5000;

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
          resolve(true);
        } else if (Date.now() >= deadline) {
          // Store not available in this build — tests that require ADS-B state
          // should be built with VITE_E2E=true (set by `just test-e2e-docker`).
          resolve(false);
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

    // Wait for navigation to be visible (core app element).
    // On mobile the desktop <nav class="hide_when_small"> is CSS-hidden;
    // check the outer <header class="navigation"> which is always visible.
    await expect(page.locator("header.navigation")).toBeVisible();

    // Verify page title
    await expect(page).toHaveTitle(/ACARS Hub/i);
  });

  test("should have navigation menu", async ({ page }) => {
    await page.goto("/");
    const storeInjected = await injectDecoderState(page); // Enable all decoders including ADS-B

    // Nav structure:
    //   Desktop: Live Messages | Live Map (adsb only) | Search Database | Alerts | Status
    //            Logo link (→ /about, labelled "ACARS Hub") | Settings (button)
    //   Mobile:  hamburger <details> containing the same links — must be opened first

    // On mobile the links are inside a collapsed <details> element; open it first.
    const mobileMenu = page.locator("details.small_nav");
    if (await mobileMenu.isVisible()) {
      await page.locator("details.small_nav > summary").click();
    }

    await expect(
      page.getByRole("link", { name: /live messages/i }),
    ).toBeVisible();
    // Live Map is only rendered when ADS-B decoder state is injected.
    // injectDecoderState returns false when the store isn't exposed (non-E2E builds).
    if (storeInjected) {
      await expect(page.getByRole("link", { name: /live map/i })).toBeVisible();
    }
    await expect(
      page.getByRole("link", { name: /search database/i }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /alerts/i })).toBeVisible();
    // "Status" is the nav link text — routes to /status (the stats/status page)
    await expect(page.getByRole("link", { name: /^status$/i })).toBeVisible();
    // The ACARS Hub logo link (→ /about) is in the desktop nav only.
    // On mobile the hamburger menu is open but the logo is hidden, so only
    // assert it when we are on the desktop layout.
    if (!(await mobileMenu.isVisible())) {
      await expect(
        page.getByRole("link", { name: /acars hub/i }),
      ).toBeVisible();
    }
  });

  test("should navigate to different pages", async ({ page }) => {
    await page.goto("/");

    // Nav structure:
    //   Desktop: logo link (→ /about) | Live Messages | Status (→ /status) | …
    //   Mobile:  hamburger <details> — no About link; navigate directly
    //
    // We navigate to /about directly rather than clicking the logo because the
    // logo link is desktop-only and the click is unreliable in headless mode
    // (the image inside the anchor can interfere with the pointer event).
    await page.goto("/about");
    await expect(page).toHaveURL(/\/about/);

    // On mobile open the hamburger menu so nav links are accessible
    const mobileMenu = page.locator("details.small_nav");
    const isOnMobile = await mobileMenu.isVisible();
    if (isOnMobile) {
      await page.locator("details.small_nav > summary").click();
    }

    // Navigate to Status page (nav link text is "Status", route is /status).
    // Use Promise.all + waitForURL so the assertion is decoupled from the
    // action timeout — prevents flakiness under parallel-browser load where
    // Vite may take a moment to serve lazy-loaded chunks.
    await Promise.all([
      page.waitForURL(/\/status/, { timeout: 15000 }),
      page
        .getByRole("link", { name: /^status$/i })
        .first()
        .click(),
    ]);

    // Navigate back to Live Messages
    if (isOnMobile) {
      await page.locator("details.small_nav > summary").click();
    }
    await Promise.all([
      page.waitForURL(/\/live-messages/, { timeout: 15000 }),
      page
        .getByRole("link", { name: /live messages/i })
        .first()
        .click(),
    ]);
  });

  test("should open and close Settings modal", async ({ page }) => {
    await page.goto("/");

    // On mobile the Settings button lives inside the collapsed hamburger menu.
    // Open the menu first so the button is accessible.
    const mobileMenu = page.locator("details.small_nav");
    if (await mobileMenu.isVisible()) {
      await page.locator("details.small_nav > summary").click();
    }

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

    // On mobile, navigation is in a div.show_when_small container that holds
    // a details.small_nav hamburger element.
    const mobileNavContainer = page.locator("div.show_when_small");
    await expect(mobileNavContainer).toBeVisible();

    // Content should be visible and not cause horizontal scroll
    const body = page.locator("body");
    const scrollWidth = await body.evaluate((el) => el.scrollWidth);
    const clientWidth = await body.evaluate((el) => el.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test("should switch themes", async ({ page }) => {
    await page.goto("/");

    // On mobile the Settings button lives inside the collapsed hamburger menu.
    const mobileMenu = page.locator("details.small_nav");
    if (await mobileMenu.isVisible()) {
      await page.locator("details.small_nav > summary").click();
    }

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

    // Theme should persist — reopen settings.
    // Re-open hamburger on mobile before clicking Settings again.
    if (await mobileMenu.isVisible()) {
      await page.locator("details.small_nav > summary").click();
    }
    await page.getByRole("button", { name: /settings/i }).click();
    await page.getByRole("tab", { name: /appearance/i }).click();

    // Latte should still be selected
    const latteInputReopen = page.locator('input[type="radio"][value="latte"]');
    await expect(latteInputReopen).toBeChecked();
  });
});
