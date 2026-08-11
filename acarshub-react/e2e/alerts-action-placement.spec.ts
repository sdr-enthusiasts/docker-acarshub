import { expect, type Page, test } from "@playwright/test";

// ---------------------------------------------------------------------------
// alerts-action-placement.spec.ts
//
// Purpose
// -------
// Regression suite for the Alerts page's "Mark All Read" action remaining
// visible and correctly anchored at every viewport.
//
// The bug this guards against: `.page__header` is hidden by
// `@media (max-height: 800px)`, which took the Mark All Read button with it.
// Hiding the header is intended — hiding the action is not. The action now
// relocates to one of three homes depending on viewport (see
// hooks/useAlertActionPlacement.ts).
//
// Why this needs to be E2E rather than a unit test
// ------------------------------------------------
// The failure mode is *visual*, not structural: the button is present in the
// DOM in every case; what breaks is whether an ancestor is `display: none`,
// whether it is clipped out of the nav bar, or whether it overlaps the
// msg/min widget. jsdom has no layout engine and reports every element as
// visible with a zero-sized box, so only a real browser can catch it. Unit
// coverage of the placement *rule* lives in
// src/hooks/__tests__/useAlertActionPlacement.test.ts.
//
// This spec runs viewport-driven assertions and therefore overrides the
// project viewport per test rather than relying on the project matrix.
// ---------------------------------------------------------------------------

const MIN_TOUCH = 44;

interface MinimalAcarsMsg {
  uid: string;
  message_type: string;
  timestamp: number;
  station_id: string;
  flight?: string;
  tail?: string;
  text?: string;
  label?: string;
  matched?: boolean;
  matched_text?: string[];
}

const ALERT_MSG: MinimalAcarsMsg = {
  uid: "placement-alert-1",
  message_type: "acars",
  timestamp: 1_700_000_000,
  station_id: "TEST",
  flight: "UAL123",
  tail: "N12345",
  text: "EMERGENCY placement fixture",
  label: "H1",
  matched: true,
  matched_text: ["UAL123"],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function injectAlertTerms(page: Page, terms: string[]): Promise<boolean> {
  return page.evaluate((termList) => {
    return new Promise<boolean>((resolve) => {
      const deadline = Date.now() + 5000;
      const tryInject = () => {
        // biome-ignore lint/suspicious/noExplicitAny: Required for E2E testing window access
        const store = (window as any).__ACARS_STORE__;
        if (store) {
          store.getState().setAlertTerms({ terms: termList, ignore: [] });
          resolve(true);
        } else if (Date.now() >= deadline) {
          resolve(false);
        } else {
          setTimeout(tryInject, 50);
        }
      };
      tryInject();
    });
  }, terms);
}

async function injectAlertMessage(
  page: Page,
  msg: MinimalAcarsMsg,
): Promise<boolean> {
  return page.evaluate((message) => {
    return new Promise<boolean>((resolve) => {
      const deadline = Date.now() + 5000;
      const tryInject = () => {
        // biome-ignore lint/suspicious/noExplicitAny: Required for E2E testing window access
        const store = (window as any).__ACARS_STORE__;
        if (store) {
          store.getState().addAlertMessage(message);
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
 * Loads the app at the given viewport, seeds one unread alert, and navigates
 * to the Alerts page via client-side routing.
 *
 * The viewport is set BEFORE the first paint so the placement hook's initial
 * matchMedia read is already correct — resizing afterwards would exercise the
 * (separately tested) resize path instead of the cold-load path most users
 * actually hit.
 */
async function gotoAlertsAt(
  page: Page,
  width: number,
  height: number,
): Promise<void> {
  await page.setViewportSize({ width, height });
  await page.goto("/");
  await expect(page.locator("header.navigation")).toBeVisible();

  expect(await injectAlertTerms(page, ["UAL123"])).toBe(true);
  expect(await injectAlertMessage(page, ALERT_MSG)).toBe(true);

  const mobileMenu = page.locator("details.small_nav");
  if (await mobileMenu.isVisible()) {
    await page.locator("details.small_nav > summary").click();
  }

  await Promise.all([
    page.waitForURL(/\/alerts/, { timeout: 15000 }),
    page
      .getByRole("link", { name: /^alerts/i })
      .first()
      .click(),
  ]);

  // Always-visible content-area anchor (the header may be hidden here).
  await expect(page.locator(".alerts-page__mode-toggle")).toBeVisible();
}

const markAllRead = (page: Page) =>
  page.getByRole("button", { name: /mark all read/i });

// ---------------------------------------------------------------------------
// The placement matrix
//
// Each row is a real device/window shape mapped to the placement it must
// resolve to. Thresholds: header hidden at height <= 800px; nav-slot below
// 768px width.
// ---------------------------------------------------------------------------

interface PlacementCase {
  label: string;
  width: number;
  height: number;
  placement: "page-header" | "controls-bar" | "nav-slot";
}

const CASES: PlacementCase[] = [
  // --- Tall viewports: header visible, action stays in it -------------------
  {
    label: "desktop 1080p",
    width: 1920,
    height: 1080,
    placement: "page-header",
  },
  { label: "laptop tall", width: 1280, height: 900, placement: "page-header" },
  {
    label: "tablet portrait",
    width: 768,
    height: 1024,
    placement: "page-header",
  },
  {
    label: "phone portrait tall",
    width: 390,
    height: 844,
    placement: "page-header",
  },
  {
    label: "height boundary 801",
    width: 1280,
    height: 801,
    placement: "page-header",
  },

  // --- Short + wide: header gone, action moves to the mode row --------------
  {
    label: "height boundary 800",
    width: 1280,
    height: 800,
    placement: "controls-bar",
  },
  { label: "laptop 720p", width: 1280, height: 720, placement: "controls-bar" },
  {
    label: "tablet landscape",
    width: 1024,
    height: 768,
    placement: "controls-bar",
  },
  {
    label: "width boundary 768",
    width: 768,
    height: 720,
    placement: "controls-bar",
  },
  {
    label: "phone landscape wide",
    width: 844,
    height: 390,
    placement: "controls-bar",
  },

  // --- Short + narrow: header gone and no room on the mode row --------------
  {
    label: "width boundary 767",
    width: 767,
    height: 720,
    placement: "nav-slot",
  },
  { label: "phone landscape", width: 667, height: 375, placement: "nav-slot" },
  {
    label: "phone portrait short",
    width: 390,
    height: 664,
    placement: "nav-slot",
  },
  { label: "small phone", width: 320, height: 568, placement: "nav-slot" },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Alerts — Mark All Read placement", () => {
  for (const { label, width, height, placement } of CASES) {
    test(`${label} (${width}x${height}) → ${placement}`, async ({ page }) => {
      await gotoAlertsAt(page, width, height);

      const button = markAllRead(page);

      // 1. Visible. This is the entire point of the feature — at no viewport
      //    may the action be unreachable.
      await expect(button).toBeVisible();

      // 2. Resolved to the expected placement.
      await expect(button).toHaveAttribute("data-placement", placement);

      // 3. Exactly one instance — never duplicated across placements.
      await expect(button).toHaveCount(1);

      // 4. Anchored in the correct container.
      if (placement === "page-header") {
        await expect(
          page.locator(".page__header .alerts-page__mark-read-button"),
        ).toBeVisible();
      } else if (placement === "controls-bar") {
        await expect(
          page.locator(".alerts-page__mode-row .alerts-page__mark-read-button"),
        ).toBeVisible();
      } else {
        await expect(
          page.locator(
            ".mobile_nav_action_slot .alerts-page__mark-read-button",
          ),
        ).toBeVisible();
      }

      // 5. Actually within the viewport, not merely "not display:none".
      //    A control pushed off the right edge of the nav bar satisfies
      //    toBeVisible() but is unusable.
      const box = await button.boundingBox();
      expect(box).not.toBeNull();
      if (box) {
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
        expect(box.y + box.height).toBeLessThanOrEqual(height + 1);
      }

      // 6. Clickable, and the click reaches the handler. Portalled content in
      //    particular could be visually present but covered by the nav's
      //    stacking context.
      await button.click();
      await expect(button).toHaveCount(0); // hidden once nothing is unread
    });
  }

  test("action does not overlap the msg/min widget in the nav slot", async ({
    page,
  }) => {
    // The nav-slot placement shares a phone-width line with the message-rate
    // widget. Overlap here would mean one of them is unreadable.
    await gotoAlertsAt(page, 700, 500);

    const button = markAllRead(page);
    await expect(button).toHaveAttribute("data-placement", "nav-slot");

    const rate = page.locator(".message-rate");
    // The widget is itself hidden below 375px width; only compare when shown.
    if (await rate.isVisible()) {
      const rateBox = await rate.boundingBox();
      const btnBox = await button.boundingBox();
      expect(rateBox).not.toBeNull();
      expect(btnBox).not.toBeNull();
      if (rateBox && btnBox) {
        // Button sits to the right of the widget, with no horizontal overlap.
        expect(btnBox.x).toBeGreaterThanOrEqual(rateBox.x + rateBox.width - 1);
      }
    }
  });

  test("controls-bar action is exactly as tall as the mode buttons", async ({
    page,
  }) => {
    // The action sits on the same row as Live/Historical. Any height
    // difference between them reads as a misalignment bug rather than as
    // deliberate visual hierarchy.
    //
    // Enforced by align-self:stretch in SCSS rather than by duplicating the
    // mode button's metrics, so this test is what catches a future padding
    // change on either element silently decoupling the two.
    await gotoAlertsAt(page, 1280, 720);

    const button = markAllRead(page);
    await expect(button).toHaveAttribute("data-placement", "controls-bar");

    const liveButton = page
      .locator(".alerts-page__mode-button")
      .filter({ hasText: /^Live$/ });

    const actionBox = await button.boundingBox();
    const modeBox = await liveButton.boundingBox();
    expect(actionBox).not.toBeNull();
    expect(modeBox).not.toBeNull();

    if (actionBox && modeBox) {
      // Sub-pixel rounding is tolerable; anything more is visible.
      expect(Math.abs(actionBox.height - modeBox.height)).toBeLessThanOrEqual(
        1,
      );

      // Same height is necessary but not sufficient — they must also share a
      // baseline, otherwise equal boxes can still sit vertically offset.
      expect(Math.abs(actionBox.y - modeBox.y)).toBeLessThanOrEqual(1);
    }
  });

  test("controls-bar action still meets the 44px touch floor", async ({
    page,
  }) => {
    // Matching the mode buttons is only correct if the mode buttons are
    // themselves >= 44px. Pin that, so a future shrink of the mode button
    // cannot quietly drag the action below the touch floor with it.
    await gotoAlertsAt(page, 768, 720);

    const button = markAllRead(page);
    await expect(button).toHaveAttribute("data-placement", "controls-bar");

    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.height).toBeGreaterThanOrEqual(MIN_TOUCH);
    }
  });

  test("nav-slot action keeps a 44px touch target", async ({ page }) => {
    // SCSS-TOUCH: the nav placement trims horizontal padding to fit, which is
    // exactly the kind of change that quietly breaks the vertical touch floor.
    await gotoAlertsAt(page, 390, 664);

    const button = markAllRead(page);
    await expect(button).toHaveAttribute("data-placement", "nav-slot");

    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.height).toBeGreaterThanOrEqual(MIN_TOUCH);
    }
  });

  test("action follows the viewport when it is resized live", async ({
    page,
  }) => {
    // Users rotate phones and drag window edges; the action must re-home
    // without a reload and without ever being duplicated mid-transition.
    await gotoAlertsAt(page, 1280, 900);

    const button = markAllRead(page);
    await expect(button).toHaveAttribute("data-placement", "page-header");

    await page.setViewportSize({ width: 1280, height: 700 });
    await expect(button).toHaveAttribute("data-placement", "controls-bar");
    await expect(button).toBeVisible();
    await expect(button).toHaveCount(1);

    await page.setViewportSize({ width: 500, height: 700 });
    await expect(button).toHaveAttribute("data-placement", "nav-slot");
    await expect(button).toBeVisible();
    await expect(button).toHaveCount(1);

    await page.setViewportSize({ width: 500, height: 900 });
    await expect(button).toHaveAttribute("data-placement", "page-header");
    await expect(button).toBeVisible();
    await expect(button).toHaveCount(1);
  });

  test("action leaves the nav slot when navigating away from Alerts", async ({
    page,
  }) => {
    // The portal escapes the page subtree, so an unmount bug would strand the
    // button in the nav bar on every other page.
    await gotoAlertsAt(page, 390, 664);
    await expect(markAllRead(page)).toBeVisible();

    await page.locator("details.small_nav > summary").click();
    await Promise.all([
      page.waitForURL(/\/live-messages/, { timeout: 15000 }),
      page
        .getByRole("link", { name: /^messages/i })
        .first()
        .click(),
    ]);

    await expect(markAllRead(page)).toHaveCount(0);
    await expect(page.locator(".mobile_nav_action_slot")).toBeEmpty();
  });

  test("historical mode has no action at any placement", async ({ page }) => {
    // Historical results carry no read state; a lingering button would be a
    // no-op control, and in the nav slot it would look like a global action.
    await gotoAlertsAt(page, 390, 664);
    await expect(markAllRead(page)).toBeVisible();

    await page.getByRole("button", { name: /^historical$/i }).click();

    await expect(markAllRead(page)).toHaveCount(0);
    await expect(page.locator(".mobile_nav_action_slot")).toBeEmpty();
  });
});
