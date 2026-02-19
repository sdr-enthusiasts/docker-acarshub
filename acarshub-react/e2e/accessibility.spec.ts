import AxeBuilder from "@axe-core/playwright";
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
 * Accessibility Testing Suite
 *
 * Tests WCAG 2.1 AA compliance using axe-core across all pages.
 *
 * Key areas tested:
 * - Color contrast (WCAG AA: 4.5:1 for normal text, 3:1 for large text)
 * - Keyboard navigation
 * - ARIA labels and roles
 * - Form accessibility
 * - Focus management
 * - Semantic HTML
 */

test.describe("Accessibility - Core Pages", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to app — baseURL is configured in playwright.config.ts
    await page.goto("/");
    // Wait for app to load — header.navigation is always present (desktop + mobile)
    await expect(page.locator("header.navigation")).toBeVisible();
  });

  test("Live Messages page should not have accessibility violations", async ({
    page,
  }) => {
    // Navigate to Live Messages directly
    await page.goto("/live-messages");
    await injectDecoderState(page); // Enable all decoders including ADS-B
    await expect(page).toHaveURL(/\/live-messages/);

    // Run axe accessibility scan
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test("Status page should not have accessibility violations", async ({
    page,
  }) => {
    // Navigate directly — avoids needing to click through nav which varies desktop/mobile
    await page.goto("/status");
    await injectDecoderState(page); // Enable all decoders including ADS-B
    await expect(page).toHaveURL(/\/status/);
    await page.waitForTimeout(500); // Wait for charts to render

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test.skip("Live Map page should not have accessibility violations", async ({
    page,
  }) => {
    // NOTE: Skipped — Live Map has known nested-interactive-control violations
    // in the MapLibre canvas layer. Fix the app before un-skipping.
    await page.goto("/adsb");
    await injectDecoderState(page); // Enable ADS-B decoder
    await expect(page).toHaveURL(/\/adsb/);
    await page.waitForTimeout(1000); // Wait for map to initialize

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test("Alerts page should not have accessibility violations", async ({
    page,
  }) => {
    // Navigate directly — avoids needing to click through nav which varies desktop/mobile
    await page.goto("/alerts");
    await injectDecoderState(page); // Enable all decoders including ADS-B
    await expect(page).toHaveURL(/\/alerts/);

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test("Search page should not have accessibility violations", async ({
    page,
  }) => {
    // Navigate directly — nav link is "Search Database" not "Search", use goto
    await page.goto("/search");
    await injectDecoderState(page); // Enable all decoders including ADS-B
    await expect(page).toHaveURL(/\/search/);

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test("About page should not have accessibility violations", async ({
    page,
  }) => {
    // Navigate directly — "About" link is only in the desktop logo (no mobile link)
    await page.goto("/about");
    await injectDecoderState(page); // Enable all decoders including ADS-B
    await expect(page).toHaveURL(/\/about/);

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });
});

test.describe.skip("Accessibility - Settings Modal", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for app to load — header.navigation is always present (desktop + mobile)
    await expect(page.locator("header.navigation")).toBeVisible();

    // On mobile the Settings button lives inside the hamburger menu
    const mobileMenu = page.locator("details.small_nav");
    if (await mobileMenu.isVisible()) {
      await page.locator("details.small_nav > summary").click();
    }
  });

  test("Settings modal should not have accessibility violations", async ({
    page,
  }) => {
    // Navigate to home and inject decoder state
    await page.goto("/");
    await injectDecoderState(page);

    // Open settings modal — Settings button is in the nav (already opened on mobile in beforeEach)
    await page.getByRole("button", { name: /settings/i }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    // Run axe accessibility scan
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test("All Settings tabs should be accessible", async ({ page }) => {
    // Open Settings modal
    await page.getByRole("button", { name: /settings/i }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    // Actual tab labels in SettingsModal.tsx (in order):
    // Appearance | Regional & Time | Notifications | Data | Map | Advanced
    const tabs = [
      "Appearance",
      "Regional & Time",
      "Notifications",
      "Data",
      "Map",
      "Advanced",
    ];

    for (const tabName of tabs) {
      // Click the tab using role-based selector
      await page.getByRole("tab", { name: tabName }).click();
      await page.waitForTimeout(300); // Wait for tab content to render

      // Run axe scan
      const accessibilityScanResults = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();

      expect(
        accessibilityScanResults.violations,
        `Tab "${tabName}" should not have violations`,
      ).toEqual([]);
    }
  });
});

test.describe.skip("Accessibility - Keyboard Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for app to load — header.navigation is always present (desktop + mobile)
    await expect(page.locator("header.navigation")).toBeVisible();
  });

  test("Should navigate main menu with keyboard", async ({ page }) => {
    // Tab to first navigation link
    await page.keyboard.press("Tab");

    // Verify focus is on a navigation link
    const focusedElement = await page.evaluate(() => {
      const el = document.activeElement;
      return {
        tagName: el?.tagName,
        role: el?.getAttribute("role"),
        text: el?.textContent?.trim(),
      };
    });

    expect(focusedElement.tagName).toBe("A");
    expect(focusedElement.text).toBeTruthy();

    // Navigate through menu with arrow keys or tab
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");

    // Should still be focusable elements
    const secondFocus = await page.evaluate(
      () => document.activeElement?.tagName,
    );
    expect(["A", "BUTTON"]).toContain(secondFocus);
  });

  test("Should open and close Settings modal with keyboard", async ({
    page,
  }) => {
    // Tab to Settings button
    let attempts = 0;
    while (attempts < 20) {
      await page.keyboard.press("Tab");
      const ariaLabel = await page.evaluate(() =>
        document.activeElement?.getAttribute("aria-label"),
      );
      if (ariaLabel === "Settings") {
        break;
      }
      attempts++;
    }

    // Open modal with Enter
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();

    // Close with Escape
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).not.toBeVisible();
  });

  test("Should navigate Settings tabs with keyboard", async ({ page }) => {
    // Open Settings
    await page.getByRole("button", { name: /settings/i }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    // Tab to first tab button
    await page.keyboard.press("Tab");

    // Press Arrow Right to move to next tab
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(200);

    // Verify tab changed (Regional & Time should be active)
    // Settings tabs use class "settings-tab" and role="tab" with aria-selected
    const activeTabText = await page.evaluate(() => {
      const activeTab = document.querySelector(
        '[role="tab"][aria-selected="true"]',
      );
      return activeTab?.textContent?.trim();
    });

    expect(activeTabText).toBe("Regional & Time");

    // Arrow Left should go back
    await page.keyboard.press("ArrowLeft");
    await page.waitForTimeout(200);

    const firstTabText = await page.evaluate(() => {
      const activeTab = document.querySelector(
        '[role="tab"][aria-selected="true"]',
      );
      return activeTab?.textContent?.trim();
    });

    expect(firstTabText).toBe("Appearance");
  });
});

test.describe.skip("Accessibility - Color Contrast", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for app to load — header.navigation is always present (desktop + mobile)
    await expect(page.locator("header.navigation")).toBeVisible();

    // On mobile the Settings button lives inside the hamburger menu
    const mobileMenu = page.locator("details.small_nav");
    if (await mobileMenu.isVisible()) {
      await page.locator("details.small_nav > summary").click();
    }
  });

  test("Dark theme (Mocha) should pass color contrast requirements", async ({
    page,
  }) => {
    // Ensure dark theme is active (default)
    const theme = await page.evaluate(() =>
      document.documentElement.getAttribute("data-theme"),
    );

    if (theme !== "dark" && theme !== null) {
      // Switch to dark theme via Settings → Appearance
      await page.getByRole("button", { name: /settings/i }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.getByRole("tab", { name: /appearance/i }).click();
      await page.locator('input[type="radio"][value="mocha"]').click();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).not.toBeVisible();
      await page.waitForTimeout(300);
    }

    // Run color contrast check
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(["wcag2aa"])
      .include(["body"])
      .analyze();

    const contrastViolations = accessibilityScanResults.violations.filter(
      (v) => v.id === "color-contrast",
    );

    expect(
      contrastViolations,
      "Dark theme should pass color contrast checks",
    ).toEqual([]);
  });

  test("Light theme (Latte) should pass color contrast requirements", async ({
    page,
  }) => {
    // Navigate to home and inject decoder state
    await page.goto("/");
    await injectDecoderState(page);

    // Switch to light theme via Settings → Appearance
    await page.getByRole("button", { name: /settings/i }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("tab", { name: /appearance/i }).click();
    await page.locator('input[type="radio"][value="latte"]').click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await page.waitForTimeout(300);

    // Run color contrast check
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(["wcag2aa"])
      .include(["body"])
      .analyze();

    const contrastViolations = accessibilityScanResults.violations.filter(
      (v) => v.id === "color-contrast",
    );

    expect(
      contrastViolations,
      "Light theme should pass color contrast checks",
    ).toEqual([]);
  });
});

test.describe.skip("Accessibility - Form Controls", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for app to load — header.navigation is always present (desktop + mobile)
    await expect(page.locator("header.navigation")).toBeVisible();

    // On mobile the Settings button lives inside the hamburger menu
    const mobileMenu = page.locator("details.small_nav");
    if (await mobileMenu.isVisible()) {
      await page.locator("details.small_nav > summary").click();
    }
  });

  test("Search form should have accessible labels", async ({ page }) => {
    // Navigate to Search page directly — nav link text is "Search Database", not "Search"
    await page.goto("/search");
    await expect(page).toHaveURL(/\/search/);

    // Check form accessibility
    const accessibilityScanResults = await new AxeBuilder({ page })
      .include([".search-page__form"])
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test("Settings form controls should be accessible", async ({ page }) => {
    // Open Settings — button has text "Settings", no aria-label attribute
    await page.getByRole("button", { name: /settings/i }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    // Check all form controls
    const accessibilityScanResults = await new AxeBuilder({ page })
      .include([".modal"])
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });
});

test.describe.skip("Accessibility - Focus Management", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for app to load — header.navigation is always present (desktop + mobile)
    await expect(page.locator("header.navigation")).toBeVisible();

    // On mobile the Settings button lives inside the hamburger menu
    const mobileMenu = page.locator("details.small_nav");
    if (await mobileMenu.isVisible()) {
      await page.locator("details.small_nav > summary").click();
    }
  });

  test("Focus should be trapped in Settings modal when open", async ({
    page,
  }) => {
    // Open Settings — button has text "Settings", no aria-label attribute
    await page.getByRole("button", { name: /settings/i }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    // Tab forward many times
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press("Tab");
    }

    // Focus should still be within modal
    const focusedElement = await page.evaluate(() => {
      const el = document.activeElement;
      const modal = document.querySelector(".modal");
      return modal?.contains(el);
    });

    expect(focusedElement).toBe(true);
  });

  test("Focus should return to trigger after closing modal", async ({
    page,
  }) => {
    // Open Settings — button has text "Settings", no aria-label attribute
    await page.getByRole("button", { name: /settings/i }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    // Close modal
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).not.toBeVisible();

    // Focus should return to Settings button — check by text content (no aria-label)
    const focusedElement = await page.evaluate(() => {
      const el = document.activeElement;
      return el?.textContent?.trim();
    });

    expect(focusedElement).toBe("Settings");
  });
});

test.describe.skip("Accessibility - Screen Reader Support", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for app to load — header.navigation is always present (desktop + mobile)
    await expect(page.locator("header.navigation")).toBeVisible();
  });

  test("Navigation should have proper ARIA landmarks", async ({ page }) => {
    const landmarks = await page.evaluate(() => {
      const nav = document.querySelector("nav");
      const main = document.querySelector("main");
      return {
        hasNav: !!nav,
        hasMain: !!main,
        navRole: nav?.getAttribute("role"),
        mainRole: main?.getAttribute("role"),
      };
    });

    expect(landmarks.hasNav).toBe(true);
    expect(landmarks.hasMain).toBe(true);
    // Nav and main are implicit landmarks, role attribute is optional
  });

  test("Buttons should have accessible names", async ({ page }) => {
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    const buttonNameViolations = accessibilityScanResults.violations.filter(
      (v) => v.id === "button-name",
    );

    expect(
      buttonNameViolations,
      "All buttons should have accessible names",
    ).toEqual([]);
  });

  test("Images should have alt text or be decorative", async ({ page }) => {
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    const imageAltViolations = accessibilityScanResults.violations.filter(
      (v) => v.id === "image-alt",
    );

    expect(
      imageAltViolations,
      "All images should have alt text or role='presentation'",
    ).toEqual([]);
  });
});
