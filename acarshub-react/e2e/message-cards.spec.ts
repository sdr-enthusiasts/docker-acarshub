import { expect, type Page, test } from "@playwright/test";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
  matched_flight?: string[];
  matched_tail?: string[];
  matched_icao?: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Inject a message into the Zustand app store via the exposed E2E handle.
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
 * Inject an alert message into the Zustand store's alertMessageGroups
 * (so it appears on the Alerts page).
 */
async function injectAlert(page: Page, msg: MinimalAcarsMsg): Promise<boolean> {
  return page.evaluate((message) => {
    return new Promise<boolean>((resolve) => {
      const deadline = Date.now() + 5000;

      const tryInject = () => {
        // biome-ignore lint/suspicious/noExplicitAny: Required for E2E testing window access
        const store = (window as any).__ACARS_STORE__;
        if (store) {
          store.getState().addMessage({ ...message, matched: true });
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
 * Navigate to a page using its nav link, handling mobile hamburger menus.
 *
 * On mobile the navigation links are hidden inside a `<details class="small_nav">`
 * element that must be opened before the link is clickable.  On desktop the
 * links are always visible.
 *
 * @param page     Playwright Page object
 * @param linkName Regex or string passed to `getByRole("link", { name })`.
 *                 Use a regex with a leading `^` anchor for Alerts to avoid
 *                 matching the "(N alerts)" badge substring.
 */
async function navigateTo(
  page: Page,
  linkName: string | RegExp,
): Promise<void> {
  const mobileMenu = page.locator("details.small_nav");
  if (await mobileMenu.isVisible()) {
    // Open the hamburger menu so nav links become clickable
    await page.locator("details.small_nav > summary").click();
  }

  await page.getByRole("link", { name: linkName }).first().click();
}

/**
 * Seed alert terms into the store so the Alerts page shows the message list
 * rather than the "No Alert Terms Configured" empty state.
 *
 * The Alerts page renders messages only when alertTerms.terms.length > 0,
 * so this must be called before navigating to the Alerts page.
 */
async function seedAlertTerms(page: Page, terms: string[]): Promise<void> {
  await page.evaluate((termsList) => {
    return new Promise<void>((resolve) => {
      const deadline = Date.now() + 5000;

      const trySeed = () => {
        // biome-ignore lint/suspicious/noExplicitAny: Required for E2E testing window access
        const store = (window as any).__ACARS_STORE__;
        if (store) {
          store.getState().setAlertTerms({ terms: termsList, ignore: [] });
          resolve();
        } else if (Date.now() >= deadline) {
          resolve();
        } else {
          setTimeout(trySeed, 50);
        }
      };

      trySeed();
    });
  }, terms);
}

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

/** First message for flight AAL100 */
const MSG_AAL_1: MinimalAcarsMsg = {
  uid: "card-aal-1",
  message_type: "ACARS",
  timestamp: 1_700_001_000,
  station_id: "CARD-TEST",
  flight: "AAL100",
  tail: "N12345",
  text: "POSITION REPORT ALPHA",
  label: "H1",
  matched: false,
  matched_text: [],
};

/** Second message for flight AAL100 */
const MSG_AAL_2: MinimalAcarsMsg = {
  uid: "card-aal-2",
  message_type: "ACARS",
  timestamp: 1_700_001_060,
  station_id: "CARD-TEST",
  flight: "AAL100",
  tail: "N12345",
  text: "POSITION REPORT BRAVO",
  label: "H1",
  matched: false,
  matched_text: [],
};

/** Third message for flight AAL100 */
const MSG_AAL_3: MinimalAcarsMsg = {
  uid: "card-aal-3",
  message_type: "ACARS",
  timestamp: 1_700_001_120,
  station_id: "CARD-TEST",
  flight: "AAL100",
  tail: "N12345",
  text: "POSITION REPORT CHARLIE",
  label: "H1",
  matched: false,
  matched_text: [],
};

/** Alert message — matched on text */
const MSG_ALERT_TEXT: MinimalAcarsMsg = {
  uid: "card-alert-text-1",
  message_type: "ACARS",
  timestamp: 1_700_002_000,
  station_id: "CARD-TEST",
  flight: "SWA789",
  tail: "N99001",
  text: "FUEL ADVISORY: FUEL LOW ON APPROACH",
  label: "Q0",
  matched: true,
  matched_text: ["FUEL LOW"],
  matched_flight: [],
  matched_tail: [],
  matched_icao: [],
};

/** Alert message — matched on flight number */
const MSG_ALERT_FLIGHT: MinimalAcarsMsg = {
  uid: "card-alert-flight-1",
  message_type: "ACARS",
  timestamp: 1_700_003_000,
  station_id: "CARD-TEST",
  flight: "UAL555",
  tail: "N77777",
  text: "ROUTINE POSITION REPORT",
  label: "H1",
  matched: true,
  matched_text: [],
  matched_flight: ["UAL555"],
  matched_tail: [],
  matched_icao: [],
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

test.describe("Message Card Interactions", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate via root so useSocketIO initialises before page-level
    // subscriptions mount (avoids the cold-goto race condition).
    await page.goto("/");
    await expect(page.locator("header.navigation")).toBeVisible();

    // Client-side navigate to Live Messages.  Use navigateTo() so the
    // hamburger menu is opened on mobile viewports before clicking the link.
    await navigateTo(page, /live messages/i);
    await expect(page.locator("header.navigation")).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // 1. Single-message group has no navigation controls
  // -------------------------------------------------------------------------

  test("single-message group has no prev/next controls", async ({ page }) => {
    const injected = await injectMessage(page, MSG_AAL_1);
    expect(injected).toBe(true);

    const group = page.locator(".message-group").filter({
      has: page.locator(".aircraft-id", { hasText: "AAL100" }),
    });
    await expect(group).toBeVisible();

    // No prev/next buttons on a single-message group
    await expect(
      group.getByRole("button", { name: /previous message/i }),
    ).not.toBeVisible();
    await expect(
      group.getByRole("button", { name: /next message/i }),
    ).not.toBeVisible();

    // No counter text
    await expect(group.locator(".counter-text")).not.toBeVisible();
  });

  // -------------------------------------------------------------------------
  // 2. Multi-message group shows counter text
  // -------------------------------------------------------------------------

  test("multi-message group shows message counter", async ({ page }) => {
    const i1 = await injectMessage(page, MSG_AAL_1);
    expect(i1).toBe(true);
    const i2 = await injectMessage(page, MSG_AAL_2);
    expect(i2).toBe(true);

    const group = page.locator(".message-group").filter({
      has: page.locator(".aircraft-id", { hasText: "AAL100" }),
    });

    // Counter should show "Message 1/2"
    await expect(group.locator(".counter-text")).toContainText(/message 1\/2/i);

    // Prev/next buttons should be present
    await expect(
      group.getByRole("button", { name: /previous message/i }),
    ).toBeVisible();
    await expect(
      group.getByRole("button", { name: /next message/i }),
    ).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // 3. Next button advances the counter
  // -------------------------------------------------------------------------

  test("clicking next advances the message counter", async ({ page }) => {
    const i1 = await injectMessage(page, MSG_AAL_1);
    expect(i1).toBe(true);
    const i2 = await injectMessage(page, MSG_AAL_2);
    expect(i2).toBe(true);
    const i3 = await injectMessage(page, MSG_AAL_3);
    expect(i3).toBe(true);

    const group = page.locator(".message-group").filter({
      has: page.locator(".aircraft-id", { hasText: "AAL100" }),
    });

    await expect(group.locator(".counter-text")).toContainText(/message 1\/3/i);

    // Click next — should advance to message 2
    await group.getByRole("button", { name: /next message/i }).click();
    await expect(group.locator(".counter-text")).toContainText(/message 2\/3/i);

    // Click next again — should advance to message 3
    await group.getByRole("button", { name: /next message/i }).click();
    await expect(group.locator(".counter-text")).toContainText(/message 3\/3/i);

    // Click next at the end — should wrap around to message 1
    await group.getByRole("button", { name: /next message/i }).click();
    await expect(group.locator(".counter-text")).toContainText(/message 1\/3/i);
  });

  // -------------------------------------------------------------------------
  // 4. Previous button goes back
  // -------------------------------------------------------------------------

  test("clicking previous wraps to the last message from position 1", async ({
    page,
  }) => {
    const i1 = await injectMessage(page, MSG_AAL_1);
    expect(i1).toBe(true);
    const i2 = await injectMessage(page, MSG_AAL_2);
    expect(i2).toBe(true);
    const i3 = await injectMessage(page, MSG_AAL_3);
    expect(i3).toBe(true);

    const group = page.locator(".message-group").filter({
      has: page.locator(".aircraft-id", { hasText: "AAL100" }),
    });

    // Start at message 1
    await expect(group.locator(".counter-text")).toContainText(/message 1\/3/i);

    // Clicking previous from position 1 wraps around to the last message
    await group.getByRole("button", { name: /previous message/i }).click();
    await expect(group.locator(".counter-text")).toContainText(/message 3\/3/i);

    // Clicking previous again goes to 2
    await group.getByRole("button", { name: /previous message/i }).click();
    await expect(group.locator(".counter-text")).toContainText(/message 2\/3/i);
  });

  // -------------------------------------------------------------------------
  // 5. Active message content changes when navigating
  // -------------------------------------------------------------------------

  test("message content updates when navigating with next", async ({
    page,
  }) => {
    const i1 = await injectMessage(page, MSG_AAL_1);
    expect(i1).toBe(true);
    const i2 = await injectMessage(page, MSG_AAL_2);
    expect(i2).toBe(true);

    const group = page.locator(".message-group").filter({
      has: page.locator(".aircraft-id", { hasText: "AAL100" }),
    });
    const content = group.locator(".message-group__content");

    // Messages are stored newest-first (prepended on arrival), so after
    // injecting AAL_1 then AAL_2, the active message (index 0) is AAL_2 (BRAVO).
    await expect(content).toContainText("POSITION REPORT BRAVO");

    // Advance to the next slot (index 1) — wraps back to AAL_1 (ALPHA)
    await group.getByRole("button", { name: /next message/i }).click();

    // Older message should now be visible
    await expect(content).toContainText("POSITION REPORT ALPHA");

    // Newer message should no longer be visible
    await expect(content).not.toContainText("POSITION REPORT BRAVO");
  });

  // -------------------------------------------------------------------------
  // 6. Tab dots reflect the active message
  // -------------------------------------------------------------------------

  test("clicking a tab dot jumps directly to that message", async ({
    page,
  }) => {
    const i1 = await injectMessage(page, MSG_AAL_1);
    expect(i1).toBe(true);
    const i2 = await injectMessage(page, MSG_AAL_2);
    expect(i2).toBe(true);
    const i3 = await injectMessage(page, MSG_AAL_3);
    expect(i3).toBe(true);

    const group = page.locator(".message-group").filter({
      has: page.locator(".aircraft-id", { hasText: "AAL100" }),
    });

    // Tab 1 should start active (aria-selected=true)
    const tab1 = group.locator('[role="tab"]').nth(0);
    const tab3 = group.locator('[role="tab"]').nth(2);

    await expect(tab1).toHaveAttribute("aria-selected", "true");
    await expect(tab3).toHaveAttribute("aria-selected", "false");

    // Click tab 3 directly
    await tab3.click();

    // Counter should jump to 3
    await expect(group.locator(".counter-text")).toContainText(/message 3\/3/i);

    // Tab 3 should now be active
    await expect(tab3).toHaveAttribute("aria-selected", "true");
    await expect(tab1).toHaveAttribute("aria-selected", "false");
  });

  // -------------------------------------------------------------------------
  // 7. Keyboard navigation (ArrowRight / ArrowLeft)
  // -------------------------------------------------------------------------

  test("keyboard ArrowRight advances message; ArrowLeft goes back", async ({
    page,
    browserName,
  }) => {
    // Firefox and WebKit handle focus differently for keyboard events on
    // non-input elements in certain viewport configurations — skip there.
    test.skip(
      browserName !== "chromium",
      "Keyboard navigation on custom div elements is reliable only in Chromium",
    );

    const i1 = await injectMessage(page, MSG_AAL_1);
    expect(i1).toBe(true);
    const i2 = await injectMessage(page, MSG_AAL_2);
    expect(i2).toBe(true);
    const i3 = await injectMessage(page, MSG_AAL_3);
    expect(i3).toBe(true);

    const group = page.locator(".message-group").filter({
      has: page.locator(".aircraft-id", { hasText: "AAL100" }),
    });

    // Focus the group container (tabIndex=0 when multi-message)
    await group.focus();
    await expect(group.locator(".counter-text")).toContainText(/message 1\/3/i);

    // ArrowRight
    await group.press("ArrowRight");
    await expect(group.locator(".counter-text")).toContainText(/message 2\/3/i);

    // ArrowRight again
    await group.press("ArrowRight");
    await expect(group.locator(".counter-text")).toContainText(/message 3\/3/i);

    // ArrowLeft
    await group.press("ArrowLeft");
    await expect(group.locator(".counter-text")).toContainText(/message 2\/3/i);
  });
});

// ---------------------------------------------------------------------------
// Alert-specific interaction tests
// ---------------------------------------------------------------------------

test.describe("Alert Message Card Interactions", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate via root to ensure store/socket initialise before the page
    await page.goto("/");
    await expect(page.locator("header.navigation")).toBeVisible();

    // Seed alert terms BEFORE navigating so the Alerts page renders the
    // messages list instead of the "No Alert Terms Configured" empty state.
    // The Alerts page only shows live messages when alertTerms.terms.length > 0.
    await seedAlertTerms(page, ["FUEL LOW", "UAL555", "FDX321", "ALERT"]);

    // Use navigateTo() so the hamburger menu is opened on mobile viewports.
    // The Alerts nav link may carry an "(N)" badge that changes its accessible
    // name — use a starts-with regex to match regardless of badge presence.
    await navigateTo(page, /^alerts/i);
    await expect(
      page.locator("h1.page__title", { hasText: /alerts/i }),
    ).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // 8. Alert card has Mark Read button
  // -------------------------------------------------------------------------

  test("alert card shows Mark Read button for unread alerts", async ({
    page,
  }) => {
    const injected = await injectAlert(page, MSG_ALERT_TEXT);
    expect(injected).toBe(true);

    // Wait for the alert group to appear in the live view
    const group = page.locator(".message-group--alert").filter({
      has: page.locator(".aircraft-id", { hasText: "SWA789" }),
    });
    await expect(group).toBeVisible();

    // The card inside the group should have a Mark Read button
    const markReadBtn = group.locator(".message-card__mark-read-btn");
    await expect(markReadBtn).toBeVisible();
    await expect(markReadBtn).toHaveText(/mark read/i);
  });

  // -------------------------------------------------------------------------
  // 9. Clicking Mark Read turns the button into a "Read" badge
  // -------------------------------------------------------------------------

  test("clicking Mark Read replaces the button with a Read badge", async ({
    page,
  }) => {
    const injected = await injectAlert(page, MSG_ALERT_TEXT);
    expect(injected).toBe(true);

    const group = page.locator(".message-group--alert").filter({
      has: page.locator(".aircraft-id", { hasText: "SWA789" }),
    });
    await expect(group).toBeVisible();

    const markReadBtn = group.locator(".message-card__mark-read-btn");
    await expect(markReadBtn).toBeVisible();

    // Click Mark Read
    await markReadBtn.click();

    // The button should be gone, replaced by the Read badge
    await expect(markReadBtn).not.toBeVisible();
    const readBadge = group.locator(".message-card__read-badge");
    await expect(readBadge).toBeVisible();
    await expect(readBadge).toHaveText(/read/i);
  });

  // -------------------------------------------------------------------------
  // 10. Mark All Read button updates unread count
  // -------------------------------------------------------------------------

  test("Mark All Read button clears the unread count", async ({ page }) => {
    const i1 = await injectAlert(page, MSG_ALERT_TEXT);
    expect(i1).toBe(true);
    const i2 = await injectAlert(page, MSG_ALERT_FLIGHT);
    expect(i2).toBe(true);

    // Wait for both groups to appear
    await expect(
      page.locator(".message-group--alert", { hasText: "SWA789" }),
    ).toBeVisible();
    await expect(
      page.locator(".message-group--alert", { hasText: "UAL555" }),
    ).toBeVisible();

    // The stats bar should show 2 unread
    await expect(page.locator(".page__stats")).toContainText(/2\s+unread/i);

    // Click Mark All Read
    await page.getByRole("button", { name: /mark all read/i }).click();

    // Unread count should drop to 0; the button should disappear
    await expect(page.locator(".page__stats")).toContainText(/0\s+unread/i);
    await expect(
      page.getByRole("button", { name: /mark all read/i }),
    ).not.toBeVisible();
  });

  // -------------------------------------------------------------------------
  // 11. Alert card applies alert styling (message-card--alert class)
  // -------------------------------------------------------------------------

  test("alert message card has alert styling applied", async ({ page }) => {
    const injected = await injectAlert(page, MSG_ALERT_TEXT);
    expect(injected).toBe(true);

    const group = page.locator(".message-group--alert").filter({
      has: page.locator(".aircraft-id", { hasText: "SWA789" }),
    });
    await expect(group).toBeVisible();

    // The inner card should carry the alert modifier class
    const card = group.locator(".message-card--alert");
    await expect(card).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // 12. Alert badge count reflects matched messages
  // -------------------------------------------------------------------------

  test("alert group shows correct alert badge count", async ({ page }) => {
    // Inject two separate alert messages for the same flight
    const alert1: MinimalAcarsMsg = {
      uid: "card-badge-1",
      message_type: "ACARS",
      timestamp: 1_700_005_000,
      station_id: "CARD-TEST",
      flight: "FDX321",
      tail: "N55555",
      text: "ALERT MESSAGE ONE",
      label: "Q0",
      matched: true,
      matched_text: ["ALERT"],
      matched_flight: [],
      matched_tail: [],
      matched_icao: [],
    };
    const alert2: MinimalAcarsMsg = {
      uid: "card-badge-2",
      message_type: "ACARS",
      timestamp: 1_700_005_060,
      station_id: "CARD-TEST",
      flight: "FDX321",
      tail: "N55555",
      text: "ALERT MESSAGE TWO",
      label: "Q0",
      matched: true,
      matched_text: ["ALERT"],
      matched_flight: [],
      matched_tail: [],
      matched_icao: [],
    };

    const i1 = await injectAlert(page, alert1);
    expect(i1).toBe(true);
    const i2 = await injectAlert(page, alert2);
    expect(i2).toBe(true);

    const group = page.locator(".message-group--alert").filter({
      has: page.locator(".aircraft-id", { hasText: "FDX321" }),
    });
    await expect(group).toBeVisible();

    // The alert-count badge should reflect 2 alerts
    await expect(group.locator(".alert-count")).toBeVisible();
    await expect(group.locator(".alert-count")).toContainText("2 alerts");
  });
});
