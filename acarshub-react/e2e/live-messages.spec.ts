import { expect, type Page, test } from "@playwright/test";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Minimum shape of an AcarsMsg required by addMessage.
 * All other fields are optional on the actual interface.
 */
interface MinimalAcarsMsg {
  uid: string;
  message_type: string;
  timestamp: number;
  station_id: string;
  flight?: string;
  tail?: string;
  icao_hex?: string;
  text?: string;
  label?: string;
  matched?: boolean;
  matched_text?: string[];
}

/**
 * Inject a message directly into the Zustand app store.
 *
 * Returns true if the store was reachable and addMessage was called,
 * false if the store was not available within 5 seconds (non-E2E build).
 */
async function injectMessage(
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
 * Click the Pause button, handling mobile (filters flyout) vs desktop (inline).
 *
 * On mobile the `.message-filters` toolbar is CSS-hidden and lives inside
 * the navigation filters flyout. We open that flyout first, click Pause,
 * then close the flyout so it does not obscure the message list.
 */
async function clickPauseButton(page: Page): Promise<void> {
  const mobileMenu = page.locator("details.small_nav");
  if (await mobileMenu.isVisible()) {
    // Open the filters flyout (only present on the Live Messages page)
    await page.getByRole("button", { name: /^filters$/i }).click();
    await page
      .locator(".navigation__filters-flyout")
      .getByRole("button", { name: /pause/i })
      .click();
    // Close flyout so it does not block assertions on the message list
    await page.locator(".filters-flyout__close").click();
  } else {
    await page
      .locator(".message-filters")
      .getByRole("button", { name: /pause/i })
      .click();
  }
}

/**
 * Click the Resume button, handling mobile (filters flyout) vs desktop.
 *
 * Assumes the filters flyout is currently closed on mobile; this helper
 * reopens it, clicks Resume, and then closes it again.
 */
async function clickResumeButton(page: Page): Promise<void> {
  const mobileMenu = page.locator("details.small_nav");
  if (await mobileMenu.isVisible()) {
    await page.getByRole("button", { name: /^filters$/i }).click();
    await page
      .locator(".navigation__filters-flyout")
      .getByRole("button", { name: /resume/i })
      .click();
    await page.locator(".filters-flyout__close").click();
  } else {
    await page
      .locator(".message-filters")
      .getByRole("button", { name: /resume/i })
      .click();
  }
}

// ---------------------------------------------------------------------------
// Shared message fixtures
// ---------------------------------------------------------------------------

/** A plain ACARS message with text content and a flight identifier. */
const MSG_FLIGHT_A: MinimalAcarsMsg = {
  uid: "e2e-msg-flight-a-1",
  message_type: "acars",
  timestamp: 1_700_000_000,
  station_id: "E2E-TEST",
  flight: "UAL123",
  text: "02XAABQKABQ13502N10637WV136975",
  label: "H1",
  matched: false,
  matched_text: [],
};

/** A second message for the same flight — used to test grouping. */
const MSG_FLIGHT_A_2: MinimalAcarsMsg = {
  uid: "e2e-msg-flight-a-2",
  message_type: "acars",
  timestamp: 1_700_000_060,
  station_id: "E2E-TEST",
  flight: "UAL123",
  text: "POS N40 W090 AT 1230Z FL350",
  label: "H1",
  matched: false,
  matched_text: [],
};

/** A message from a different flight — used to test that groups remain separate. */
const MSG_FLIGHT_B: MinimalAcarsMsg = {
  uid: "e2e-msg-flight-b-1",
  message_type: "acars",
  timestamp: 1_700_000_030,
  station_id: "E2E-TEST",
  flight: "DAL456",
  text: "ATC CLEARANCE APPROVED",
  label: "SA",
  matched: false,
  matched_text: [],
};

/** A message with alert match flags set — simulates a backend-matched alert. */
const MSG_ALERT: MinimalAcarsMsg = {
  uid: "e2e-msg-alert-1",
  message_type: "acars",
  timestamp: 1_700_000_100,
  station_id: "E2E-TEST",
  flight: "SWA789",
  text: "ALERT: FUEL LOW ADVISORY",
  label: "Q0",
  matched: true,
  matched_text: ["FUEL LOW"],
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

test.describe("Live Messages Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/live-messages");
    // Wait for the page container to be present before each test
    await expect(page.locator("header.navigation")).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // 1. Empty state
  // -------------------------------------------------------------------------

  test("shows empty state when no messages have been received", async ({
    page,
  }) => {
    // The "No Messages Yet" heading should be visible immediately
    await expect(
      page.getByRole("heading", { name: /no messages yet/i }),
    ).toBeVisible();

    // Supporting copy
    await expect(page.locator("text=Waiting for ACARS messages")).toBeVisible();

    // No message groups should be in the DOM
    await expect(page.locator(".message-group")).not.toBeVisible();
  });

  // -------------------------------------------------------------------------
  // 2. A single injected message appears in the list
  // -------------------------------------------------------------------------

  test("displays a message group when a message is injected into the store", async ({
    page,
  }) => {
    const injected = await injectMessage(page, MSG_FLIGHT_A);
    // Build with VITE_E2E=true is required for store injection.
    // If the store is unavailable this test cannot run meaningfully.
    expect(injected).toBe(true);

    // A message group should appear
    await expect(page.locator(".message-group").first()).toBeVisible();

    // The aircraft identifier (flight number) should appear in the group header
    await expect(
      page.locator(".aircraft-id", { hasText: "UAL123" }),
    ).toBeVisible();

    // The empty-state heading should be gone
    await expect(
      page.getByRole("heading", { name: /no messages yet/i }),
    ).not.toBeVisible();
  });

  // -------------------------------------------------------------------------
  // 3. Messages from the same flight are grouped together
  // -------------------------------------------------------------------------

  test("groups multiple messages from the same flight into one group", async ({
    page,
  }) => {
    const injected1 = await injectMessage(page, MSG_FLIGHT_A);
    expect(injected1).toBe(true);

    const injected2 = await injectMessage(page, MSG_FLIGHT_A_2);
    expect(injected2).toBe(true);

    // There should still be exactly one group for UAL123
    const uAl123Groups = page.locator(".message-group").filter({
      has: page.locator(".aircraft-id", { hasText: "UAL123" }),
    });
    await expect(uAl123Groups).toHaveCount(1);

    // The counter inside the group should read "Message 1/2"
    await expect(
      uAl123Groups.locator(".counter-text", { hasText: /message 1\/2/i }),
    ).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // 4. Messages from different flights form separate groups
  // -------------------------------------------------------------------------

  test("creates separate groups for messages from different flights", async ({
    page,
  }) => {
    const injectedA = await injectMessage(page, MSG_FLIGHT_A);
    expect(injectedA).toBe(true);

    const injectedB = await injectMessage(page, MSG_FLIGHT_B);
    expect(injectedB).toBe(true);

    // Both aircraft identifiers should be visible
    await expect(
      page.locator(".aircraft-id", { hasText: "UAL123" }),
    ).toBeVisible();
    await expect(
      page.locator(".aircraft-id", { hasText: "DAL456" }),
    ).toBeVisible();

    // There should be exactly two message groups
    await expect(page.locator(".message-group")).toHaveCount(2);
  });

  // -------------------------------------------------------------------------
  // 5. Alert messages get alert styling
  // -------------------------------------------------------------------------

  test("applies alert styling when a matched message is received", async ({
    page,
  }) => {
    const injected = await injectMessage(page, MSG_ALERT);
    expect(injected).toBe(true);

    // The group for SWA789 should have the alert modifier class
    const alertGroup = page.locator(".message-group--alert").filter({
      has: page.locator(".aircraft-id", { hasText: "SWA789" }),
    });
    await expect(alertGroup).toBeVisible();

    // The alert count badge should show "1 alert"
    await expect(alertGroup.locator(".alert-count")).toBeVisible();
    await expect(alertGroup.locator(".alert-count")).toContainText("1 alert");
  });

  // -------------------------------------------------------------------------
  // 6. Pause freezes the message list; Resume restores it
  // -------------------------------------------------------------------------

  test("freezes the message list when paused and restores it on resume", async ({
    page,
  }) => {
    // Inject a first message before pausing
    const injected1 = await injectMessage(page, MSG_FLIGHT_A);
    expect(injected1).toBe(true);
    await expect(
      page.locator(".aircraft-id", { hasText: "UAL123" }),
    ).toBeVisible();

    // Pause updates
    await clickPauseButton(page);

    // The pause notice should be visible
    await expect(
      page.locator(".page__notice--warning", { hasText: /updates paused/i }),
    ).toBeVisible();

    // Inject a second message (from a different flight) while paused
    const injected2 = await injectMessage(page, MSG_FLIGHT_B);
    expect(injected2).toBe(true);

    // DAL456 should NOT appear in the frozen view
    await expect(
      page.locator(".aircraft-id", { hasText: "DAL456" }),
    ).not.toBeVisible();

    // UAL123 from before the pause should still be visible
    await expect(
      page.locator(".aircraft-id", { hasText: "UAL123" }),
    ).toBeVisible();

    // Resume updates
    await clickResumeButton(page);

    // The pause notice should be gone
    await expect(page.locator(".page__notice--warning")).not.toBeVisible();

    // Both aircraft should now be visible (live view shows all messages)
    await expect(
      page.locator(".aircraft-id", { hasText: "UAL123" }),
    ).toBeVisible();
    await expect(
      page.locator(".aircraft-id", { hasText: "DAL456" }),
    ).toBeVisible();
  });
});
