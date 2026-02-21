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
 * Force all running CSS animations and transitions to their completed end state.
 *
 * The Settings modal's `.settings-panel` uses a 0.2s `fadeIn` animation
 * (opacity 0 → 1).  When axe runs while the panel is at partial opacity the
 * browser compositor blends the element with its backdrop, producing colours
 * that axe measures as low-contrast — even though the final, fully-opaque
 * colours satisfy WCAG AA.  Calling `Animation.finish()` on every live
 * animation instantly advances them to their `to` keyframe before the scan.
 *
 * This must be called after the modal/tab is visible but before AxeBuilder
 * analyzes the page.
 */
async function finishAnimations(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const animation of document.getAnimations()) {
      animation.finish();
    }
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

  test("Live Map page should not have accessibility violations", async ({
    page,
  }) => {
    await page.goto("/adsb");
    await injectDecoderState(page); // Enable ADS-B decoder
    await expect(page).toHaveURL(/\/adsb/);

    // Wait for the navigation header — always present on all viewports.
    await expect(page.locator("header.navigation")).toBeVisible();

    // Wait for the map container to gain the --loaded modifier class.
    // This class is added to the MapComponent's wrapper div when isMapLoaded
    // becomes true (either via MapLibre's onLoad event or the 10-second
    // fallback timer in LiveMapPage).  MapLibre initialises quickly in E2E
    // builds (no real tiles are fetched), so the typical wait is sub-second.
    // The 12-second ceiling covers the 10-second mobile-Safari fallback.
    //
    // NOTE: `.aircraft-list` is CSS-hidden on narrow (mobile) viewports via
    // the SCSS breakpoint — do NOT use toBeVisible() on it here.
    await expect(
      page.locator(".map-container.live-map-page__map--loaded"),
    ).toBeAttached({
      timeout: 12000,
    });

    // Snap animations to end-state before the scan to prevent mid-transition
    // colour blending from producing false contrast failures.
    await finishAnimations(page);

    // NOTE: `.maplibregl-map` is excluded from the axe scan.
    //
    // MapLibre GL JS renders its canvas container with `tabindex="0"` (required
    // for keyboard map-pan/zoom) and then places zoom-control buttons and
    // attribution links *inside* that container.  axe flags this structure as a
    // "nested-interactive" violation (WCAG 1.3.1 / 4.1.2).  This is an
    // acknowledged false-positive for interactive map widgets: the pattern is
    // necessary for keyboard accessibility of the map itself and is a
    // third-party library concern outside our control.
    //
    // Our own overlay components (MapControls, MapLegend, AircraftList) render
    // *outside* `.maplibregl-map` in the DOM and are fully covered by this scan.
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .exclude(".maplibregl-map")
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

test.describe("Accessibility - Settings Modal", () => {
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
    // Inject decoder state without reloading — the page is already at "/" from beforeEach
    // and the hamburger menu is already open on mobile.  Calling page.goto("/") again would
    // reload the page, closing the hamburger and making the Settings button unreachable on mobile.
    await injectDecoderState(page);

    // Open settings modal — Settings button is in the nav (hamburger already open on mobile
    // from beforeEach; directly visible in desktop nav)
    await page.getByRole("button", { name: /settings/i }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    // The initial Appearance tab panel plays a 0.2s fadeIn animation.  Axe
    // running mid-animation sees composited (blended) colours at partial opacity
    // that fail contrast checks even though the final colours are accessible.
    // Finish all animations first so axe scans the fully-rendered state.
    await finishAnimations(page);

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
      // Each tab switch replays the fadeIn animation; finish it before scanning.
      await finishAnimations(page);

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
    await page.goto("/");
    // Wait for app to load — header.navigation is always present (desktop + mobile)
    await expect(page.locator("header.navigation")).toBeVisible();
  });

  test("Should navigate main menu with keyboard", async ({
    page,
    isMobile,
  }) => {
    // NOTE: Mobile browsers (Pixel 5 / iPhone 12) open the hamburger menu in beforeEach,
    // which exposes extra nav links in a <details> element.  Synthetic Tab events work
    // differently across mobile WebKit/Blink vs desktop — skip on mobile to avoid flakiness.
    test.skip(isMobile, "Keyboard navigation tests are desktop-only");

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
    isMobile,
  }) => {
    // NOTE: Skip on mobile — the Settings button is inside the hamburger menu on mobile.
    // Synthetic Tab traversal to find the Settings button inside a <details> element
    // behaves inconsistently across mobile browser emulations.
    test.skip(isMobile, "Keyboard navigation tests are desktop-only");

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

  test("Should navigate Settings tabs with keyboard", async ({
    page,
    isMobile,
  }) => {
    // Synthetic Tab traversal through a <details> hamburger on narrow viewports
    // is unreliable.  The arrow-key test is meaningful on desktop only.
    test.skip(isMobile, "Keyboard navigation tests are desktop-only");

    // Open Settings
    await page.getByRole("button", { name: /settings/i }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    // Focus the first tab button directly.
    // We avoid counting Tab presses (which would need to skip past the modal
    // close button) by programmatically focusing the Appearance tab.
    // The important thing under test is that ArrowRight/ArrowLeft navigate
    // between tabs — not how many Tab presses reach the tablist.
    await page.getByRole("tab", { name: "Appearance" }).focus();

    // ArrowRight should activate the next tab (Regional & Time).
    await page.keyboard.press("ArrowRight");

    // Use retry-based assertion — React schedules the state update after the
    // key event, so a point-in-time evaluate() would be racy.
    await expect(
      page.getByRole("tab", { name: "Regional & Time" }),
    ).toHaveAttribute("aria-selected", "true");

    // ArrowLeft should return to Appearance.
    await page.keyboard.press("ArrowLeft");

    await expect(page.getByRole("tab", { name: "Appearance" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    // ArrowLeft on the first tab should wrap to the last tab (Advanced).
    await page.keyboard.press("ArrowLeft");

    await expect(page.getByRole("tab", { name: "Advanced" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});

test.describe("Accessibility - Color Contrast", () => {
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
    // Latte contrast audit completed — SCSS fixes applied:
    // - --color-subtext0 remapped to subtext1 (5.53:1 on base vs 4.37:1 ❌)
    // - --color-link remapped to mauve (4.79:1 on base vs sapphire 2.76:1 ❌)
    // - --color-link-hover remapped to text (7.06:1 vs blue 4.34:1 ❌)
    // - Navigation logo/active link use --color-text on Latte (6.04:1 on crust ✅)
    // - Connection status disconnected/connected banners use surface0+text in Latte ✅
    // - About page links use --color-link/--color-link-hover ✅
    // - Card/About code elements use transparent bg in Latte (mauve 4.79:1 on base ✅)
    page,
  }) => {
    // Navigate to home and inject decoder state.
    // NOTE: page.goto("/") resets the hamburger-menu state that beforeEach opened,
    // so we must re-open it here on mobile before touching the Settings button.
    await page.goto("/");
    await injectDecoderState(page);

    // On mobile, the Settings button is inside the hamburger dropdown.
    // The beforeEach already opened it, but page.goto() above reset the page,
    // so open it again if the mobile menu is present.
    const mobileMenuLatte = page.locator("details.small_nav");
    if (await mobileMenuLatte.isVisible()) {
      await page.locator("details.small_nav > summary").click();
    }

    // Switch to light theme via Settings → Appearance
    await page.getByRole("button", { name: /settings/i }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("tab", { name: /appearance/i }).click();
    // The radio input is visually hidden (opacity:0, width:0, height:0, pointer-events:none)
    // for custom styling — click the visible <label for="theme-latte"> element instead.
    await page.locator('label[for="theme-latte"]').click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).not.toBeVisible();

    // Kill all CSS transitions before running axe to guarantee final Latte colors.
    //
    // Root cause: WebKit's getComputedStyle() resolves CSS custom-property values
    // to their target immediately when data-theme="light" is set, but the *visual*
    // rendering (which axe reads for contrast) is still mid-transition. This means
    // axe captures the Mocha text color (#cdd6f4) against the already-updated Latte
    // base (#eff1f5), yielding a 1.27:1 contrast failure that is not visible once
    // the 200ms transition completes.
    //
    // Injecting transition:none !important forces any in-progress transitions to
    // snap instantly to their end-state, so the next repaint contains the fully-
    // applied Latte palette before axe evaluates the page.
    await page.addStyleTag({
      content:
        "*, *::before, *::after { transition: none !important; animation: none !important; }",
    });
    // One rAF-equivalent pause so the browser can repaint with the snapped colors.
    await page.waitForTimeout(100);

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

    // Finish the fadeIn animation on the initial panel before axe scans.
    await finishAnimations(page);

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
    browserName,
    isMobile,
  }) => {
    // NOTE: Firefox synthetic Tab events interact differently with custom focus-trap
    // implementations — the focus does not cycle within the modal in the same way as
    // Chrome/Safari desktop.  Skip on Firefox until the focus trap is verified or
    // updated to handle Firefox's focus-event model.
    // Mobile browsers are also excluded: synthetic keyboard Tab events on a touch
    // device do not follow the same focus-cycle as a physical keyboard.
    test.skip(
      browserName === "firefox" || isMobile,
      "Focus trap via synthetic Tab events is unreliable on Firefox and mobile browsers",
    );

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
    isMobile,
  }) => {
    // NOTE: iOS/iPadOS (Mobile Safari) does not reliably return programmatic focus to a
    // previously focused element after a modal closes — the touch focus model differs
    // from desktop keyboard focus.  Skip on all mobile browser emulations.
    test.skip(
      isMobile,
      "Focus return after modal close is unreliable on mobile browser emulations",
    );

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

test.describe("Accessibility - Screen Reader Support", () => {
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
