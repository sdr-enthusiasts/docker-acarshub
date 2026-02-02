import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

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
    // Navigate to app
    await page.goto("http://localhost:3000");
    // Wait for app to load
    await page.waitForSelector("nav", { timeout: 5000 });
  });

  test("Live Messages page should not have accessibility violations", async ({
    page,
  }) => {
    // Navigate to Live Messages (default page)
    await expect(page).toHaveURL(/\/(live-messages)?$/);

    // Run axe accessibility scan
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test("Statistics page should not have accessibility violations", async ({
    page,
  }) => {
    // Navigate to Statistics
    await page.click('a:has-text("Statistics")');
    await expect(page).toHaveURL(/\/stats$/);
    await page.waitForTimeout(500); // Wait for charts to render

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test("Live Map page should not have accessibility violations", async ({
    page,
  }) => {
    // Navigate to Live Map
    await page.click('a:has-text("Live Map")');
    await expect(page).toHaveURL(/\/live-map$/);
    await page.waitForTimeout(1000); // Wait for map to initialize

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test("Alerts page should not have accessibility violations", async ({
    page,
  }) => {
    // Navigate to Alerts
    await page.click('a:has-text("Alerts")');
    await expect(page).toHaveURL(/\/alerts$/);

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test("Search page should not have accessibility violations", async ({
    page,
  }) => {
    // Navigate to Search
    await page.click('a:has-text("Search")');
    await expect(page).toHaveURL(/\/search$/);

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test("About page should not have accessibility violations", async ({
    page,
  }) => {
    // Navigate to About
    await page.click('a:has-text("About")');
    await expect(page).toHaveURL(/\/about$/);

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });
});

test.describe("Accessibility - Settings Modal", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:3000");
    await page.waitForSelector("nav", { timeout: 5000 });
  });

  test("Settings modal should not have accessibility violations", async ({
    page,
  }) => {
    // Open Settings modal
    await page.click('button[aria-label="Settings"]');
    await page.waitForSelector(".modal", { state: "visible" });

    // Run axe on modal content
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test("All Settings tabs should be accessible", async ({ page }) => {
    // Open Settings modal
    await page.click('button[aria-label="Settings"]');
    await page.waitForSelector(".modal", { state: "visible" });

    const tabs = [
      "Appearance",
      "Regional & Time",
      "Notifications",
      "Data & Privacy",
    ];

    for (const tabName of tabs) {
      // Click tab
      await page.click(`button:has-text("${tabName}")`);
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

test.describe("Accessibility - Keyboard Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:3000");
    await page.waitForSelector("nav", { timeout: 5000 });
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
    await page.waitForSelector(".modal", { state: "visible" });

    // Close with Escape
    await page.keyboard.press("Escape");
    await page.waitForSelector(".modal", { state: "hidden" });
  });

  test("Should navigate Settings tabs with keyboard", async ({ page }) => {
    // Open Settings
    await page.click('button[aria-label="Settings"]');
    await page.waitForSelector(".modal", { state: "visible" });

    // Tab to first tab button
    await page.keyboard.press("Tab");

    // Press Arrow Right to move to next tab
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(200);

    // Verify tab changed (Regional & Time should be active)
    const activeTabText = await page.evaluate(() => {
      const activeTab = document.querySelector(
        '.tab-switcher__button[aria-selected="true"]',
      );
      return activeTab?.textContent?.trim();
    });

    expect(activeTabText).toBe("Regional & Time");

    // Arrow Left should go back
    await page.keyboard.press("ArrowLeft");
    await page.waitForTimeout(200);

    const firstTabText = await page.evaluate(() => {
      const activeTab = document.querySelector(
        '.tab-switcher__button[aria-selected="true"]',
      );
      return activeTab?.textContent?.trim();
    });

    expect(firstTabText).toBe("Appearance");
  });
});

test.describe("Accessibility - Color Contrast", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:3000");
    await page.waitForSelector("nav", { timeout: 5000 });
  });

  test("Dark theme (Mocha) should pass color contrast requirements", async ({
    page,
  }) => {
    // Ensure dark theme is active (default)
    const theme = await page.evaluate(() =>
      document.documentElement.getAttribute("data-theme"),
    );

    if (theme !== "dark" && theme !== null) {
      // Switch to dark theme
      await page.click('button[aria-label="Settings"]');
      await page.waitForSelector(".modal", { state: "visible" });
      await page.click('label:has-text("Dark (Mocha)")');
      await page.keyboard.press("Escape");
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
    // Switch to light theme
    await page.click('button[aria-label="Settings"]');
    await page.waitForSelector(".modal", { state: "visible" });
    await page.click('label:has-text("Light (Latte)")');
    await page.keyboard.press("Escape");
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

test.describe("Accessibility - Form Controls", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:3000");
    await page.waitForSelector("nav", { timeout: 5000 });
  });

  test("Search form should have accessible labels", async ({ page }) => {
    // Navigate to Search page
    await page.click('a:has-text("Search")');
    await expect(page).toHaveURL(/\/search$/);

    // Check form accessibility
    const accessibilityScanResults = await new AxeBuilder({ page })
      .include([".search-page__form"])
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test("Settings form controls should be accessible", async ({ page }) => {
    // Open Settings
    await page.click('button[aria-label="Settings"]');
    await page.waitForSelector(".modal", { state: "visible" });

    // Check all form controls
    const accessibilityScanResults = await new AxeBuilder({ page })
      .include([".modal"])
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });
});

test.describe("Accessibility - Focus Management", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:3000");
    await page.waitForSelector("nav", { timeout: 5000 });
  });

  test("Focus should be trapped in Settings modal when open", async ({
    page,
  }) => {
    // Open Settings
    await page.click('button[aria-label="Settings"]');
    await page.waitForSelector(".modal", { state: "visible" });

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
    // Open Settings (focus should be on Settings button)
    await page.click('button[aria-label="Settings"]');
    await page.waitForSelector(".modal", { state: "visible" });

    // Close modal
    await page.keyboard.press("Escape");
    await page.waitForSelector(".modal", { state: "hidden" });

    // Focus should return to Settings button
    const focusedElement = await page.evaluate(() => {
      const el = document.activeElement;
      return el?.getAttribute("aria-label");
    });

    expect(focusedElement).toBe("Settings");
  });
});

test.describe("Accessibility - Screen Reader Support", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:3000");
    await page.waitForSelector("nav", { timeout: 5000 });
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
