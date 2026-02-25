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
}

interface AlertsByTermPayload {
  total_count: number;
  messages: MinimalAcarsMsg[];
  term: string;
  page: number;
  query_time: number;
}

// ---------------------------------------------------------------------------
// Store & socket helpers
// ---------------------------------------------------------------------------

/**
 * Inject alert terms into the Zustand app store.
 *
 * Polls for `window.__ACARS_STORE__` (available in E2E builds) and calls
 * `setAlertTerms()`. Returns true when the injection succeeds, false if the
 * store is not reachable within 5 seconds.
 */
async function injectAlertTerms(
  page: Page,
  terms: string[],
  ignore: string[] = [],
): Promise<boolean> {
  return page.evaluate(
    ({ terms, ignore }) => {
      return new Promise<boolean>((resolve) => {
        const deadline = Date.now() + 5000;

        const tryInject = () => {
          // biome-ignore lint/suspicious/noExplicitAny: Required for E2E testing window access
          const store = (window as any).__ACARS_STORE__;
          if (store) {
            store.getState().setAlertTerms({ terms, ignore });
            resolve(true);
          } else if (Date.now() >= deadline) {
            resolve(false);
          } else {
            setTimeout(tryInject, 50);
          }
        };

        tryInject();
      });
    },
    { terms, ignore },
  );
}

/**
 * Inject an alert message directly into the Zustand alert message groups.
 *
 * Calls `addAlertMessage()` on the store. The message will appear in the
 * Alerts page live view immediately after React re-renders.
 */
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
 * Simulate an `alerts_by_term_results` server event arriving over Socket.IO.
 *
 * Calls `socketService.fireLocalEvent()` which fires all handlers registered
 * via `socket.on("alerts_by_term_results", ...)` without touching the network.
 * The socket service is exposed as `window.__ACARS_SOCKET__` in E2E builds
 * (`VITE_E2E=true`).
 *
 * Must be called after the AlertsPage has mounted via client-side navigation
 * so that the subscription guard (`socketService.isInitialized()`) passes and
 * the handler is actually registered.
 *
 * Returns true if the service was reachable within 5 seconds, false otherwise.
 */
async function emitAlertsByTermResults(
  page: Page,
  payload: AlertsByTermPayload,
): Promise<boolean> {
  return page.evaluate(
    ({ event, data }) => {
      return new Promise<boolean>((resolve) => {
        const deadline = Date.now() + 5000;

        const tryEmit = () => {
          // biome-ignore lint/suspicious/noExplicitAny: Required for E2E testing window access
          const svc = (window as any).__ACARS_SOCKET__;
          if (svc) {
            svc.fireLocalEvent(event, data);
            resolve(true);
          } else if (Date.now() >= deadline) {
            resolve(false);
          } else {
            setTimeout(tryEmit, 50);
          }
        };

        tryEmit();
      });
    },
    { event: "alerts_by_term_results", data: payload },
  );
}

// ---------------------------------------------------------------------------
// Navigation helpers
// ---------------------------------------------------------------------------

/**
 * Navigate to the Alerts page via client-side routing.
 *
 * Background: `AlertsPage` subscribes to `alerts_by_term_results` inside a
 * `useEffect` guarded by `socketService.isInitialized()`. React runs child
 * effects before parent effects, so a direct `page.goto("/alerts")` causes the
 * guard to fire before `useSocketIO` (in `App`) has called
 * `socketService.connect()` — the subscription is silently skipped and
 * `emitAlertsByTermResults` has no callbacks to invoke.
 *
 * Workaround: load the app root first (which initialises the socket via
 * `useSocketIO`), then navigate to `/alerts` via a nav-link click so the
 * page mounts into an already-running React tree where `isInitialized()` is
 * already true.
 *
 * Assumes the caller has already called `page.goto("/")` and that the store
 * is available for any required state injection before this helper runs.
 */
async function navigateToAlerts(page: Page): Promise<void> {
  await expect(page.locator("header.navigation")).toBeVisible();

  // On mobile the nav links are inside the hamburger menu.
  const mobileMenu = page.locator("details.small_nav");
  if (await mobileMenu.isVisible()) {
    await page.locator("details.small_nav > summary").click();
  }

  // Client-side navigation — AlertsPage mounts into an already-running tree
  // so its useEffect fires after socketService is initialised → subscription
  // is correctly registered.
  await Promise.all([
    page.waitForURL(/\/alerts/, { timeout: 15000 }),
    page
      .getByRole("link", { name: /^alerts/i })
      .first()
      .click(),
  ]);

  await expect(page.getByRole("heading", { name: /^alerts$/i })).toBeVisible();
}

/**
 * Full helper: load the app root and navigate to Alerts page.
 * Use when no state injection is required before reaching the page.
 */
async function goToAlertsPage(page: Page): Promise<void> {
  await page.goto("/");
  await navigateToAlerts(page);
}

// ---------------------------------------------------------------------------
// Shared message fixtures
// ---------------------------------------------------------------------------

/** A single alert-matched ACARS message. */
const MSG_ALERT_A: MinimalAcarsMsg = {
  uid: "alerts-e2e-a-1",
  message_type: "acars",
  timestamp: 1_700_000_000,
  station_id: "E2E-TEST",
  flight: "UAL123",
  text: "FUEL LOW ADVISORY",
  label: "Q0",
  matched: true,
  matched_text: ["UAL123"],
};

/** A second alert message for the same flight — tests unread counting. */
const MSG_ALERT_A_2: MinimalAcarsMsg = {
  uid: "alerts-e2e-a-2",
  message_type: "acars",
  timestamp: 1_700_000_060,
  station_id: "E2E-TEST",
  flight: "UAL123",
  text: "ENGINE TEMP HIGH",
  label: "Q0",
  matched: true,
  matched_text: ["UAL123"],
};

/** Historical search result payload — two messages. */
const HISTORICAL_TWO: AlertsByTermPayload = {
  total_count: 2,
  messages: [
    {
      uid: "hist-e2e-1",
      message_type: "acars",
      timestamp: 1_700_000_100,
      station_id: "E2E-TEST",
      flight: "UAL123",
      text: "DEPARTURE GATE CHANGE",
      label: "Q0",
    },
    {
      uid: "hist-e2e-2",
      message_type: "acars",
      timestamp: 1_700_000_000,
      station_id: "E2E-TEST",
      flight: "UAL123",
      text: "ARRIVAL INFO",
      label: "Q0",
    },
  ],
  term: "UAL123",
  page: 0,
  query_time: 0.012,
};

/** Historical search result payload — empty result set. */
const HISTORICAL_EMPTY: AlertsByTermPayload = {
  total_count: 0,
  messages: [],
  term: "UAL123",
  page: 0,
  query_time: 0.001,
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

test.describe("Alerts Page", () => {
  // -------------------------------------------------------------------------
  // 1. Empty state — no alert terms configured
  // -------------------------------------------------------------------------

  test("shows 'no alert terms configured' when no terms are set", async ({
    page,
  }) => {
    // Navigate without injecting any alert terms — the store starts empty.
    await goToAlertsPage(page);

    // The empty-state container should be visible
    await expect(page.locator(".alerts-page__empty-state")).toBeVisible();

    // The specific empty-state heading for the "no terms" case
    await expect(
      page.getByRole("heading", { name: /no alert terms configured/i }),
    ).toBeVisible();

    // The Historical mode button should be disabled because there are no terms
    await expect(
      page.locator(".alerts-page__mode-button", { hasText: /historical/i }),
    ).toBeDisabled();

    // The Live mode button should be active (default)
    await expect(
      page.locator(".alerts-page__mode-button--active", {
        hasText: /live/i,
      }),
    ).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // 2. Empty state — terms configured but no matching messages yet
  // -------------------------------------------------------------------------

  test("shows 'no matching messages' when terms are configured but no alerts received", async ({
    page,
  }) => {
    // Navigate to root first so we can inject state
    await page.goto("/");
    await expect(page.locator("header.navigation")).toBeVisible();

    // Inject alert terms before the Alerts page mounts
    const termsInjected = await injectAlertTerms(page, ["UAL123", "FUEL LOW"]);
    expect(termsInjected).toBe(true);

    // Navigate to Alerts — page mounts with terms in store but no groups
    await navigateToAlerts(page);

    // Should show the "no matching messages" empty state (not "no terms")
    await expect(
      page.getByRole("heading", { name: /no matching messages/i }),
    ).toBeVisible();

    // The term badges for the configured terms should be rendered
    await expect(
      page.locator(".alerts-page__term-badge", { hasText: "UAL123" }),
    ).toBeVisible();
    await expect(
      page.locator(".alerts-page__term-badge", { hasText: "FUEL LOW" }),
    ).toBeVisible();

    // The Historical button should be enabled (terms are configured)
    await expect(
      page.locator(".alerts-page__mode-button", { hasText: /historical/i }),
    ).not.toBeDisabled();
  });

  // -------------------------------------------------------------------------
  // 3. Live mode — alert groups render with correct stats
  // -------------------------------------------------------------------------

  test("renders alert groups in live mode and shows correct stats", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator("header.navigation")).toBeVisible();

    // Set up alert terms so the "no terms" empty state does not render
    const termsInjected = await injectAlertTerms(page, ["UAL123"]);
    expect(termsInjected).toBe(true);

    // Inject two alert messages for the same flight before navigating
    const injected1 = await injectAlertMessage(page, MSG_ALERT_A);
    expect(injected1).toBe(true);

    const injected2 = await injectAlertMessage(page, MSG_ALERT_A_2);
    expect(injected2).toBe(true);

    await navigateToAlerts(page);

    // A message group for UAL123 should be visible
    await expect(page.locator(".message-group")).toBeVisible();

    // Stats bar should report 2 total alerts and 2 unread
    await expect(page.locator(".page__stats")).toContainText(/2.*unread/i);
    await expect(page.locator(".page__stats")).toContainText(/2.*total alert/i);

    // The "Mark All Read" button should appear because there are unread alerts
    await expect(
      page.getByRole("button", { name: /mark all read/i }),
    ).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // 4. Mark All Read reduces unread count to zero
  // -------------------------------------------------------------------------

  test("mark all read reduces unread count to zero", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("header.navigation")).toBeVisible();

    // Configure state: one alert term, one matched message
    const termsInjected = await injectAlertTerms(page, ["UAL123"]);
    expect(termsInjected).toBe(true);
    const injected = await injectAlertMessage(page, MSG_ALERT_A);
    expect(injected).toBe(true);

    await navigateToAlerts(page);

    // Verify there is at least one unread alert before we clear them
    await expect(page.locator(".page__stats")).toContainText(/1.*unread/i);

    // Click "Mark All Read"
    await page.getByRole("button", { name: /mark all read/i }).click();

    // Unread count should immediately drop to 0
    await expect(page.locator(".page__stats")).toContainText(/0.*unread/i);

    // The "Mark All Read" button should disappear (only shown when unread > 0)
    await expect(
      page.getByRole("button", { name: /mark all read/i }),
    ).not.toBeVisible();
  });

  // -------------------------------------------------------------------------
  // 5. Historical mode — term selector is visible with the configured terms
  // -------------------------------------------------------------------------

  test("switching to historical mode shows the term selector", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator("header.navigation")).toBeVisible();

    // Must have terms for the Historical button to be enabled
    const termsInjected = await injectAlertTerms(page, ["UAL123", "DAL456"]);
    expect(termsInjected).toBe(true);

    await navigateToAlerts(page);

    // Verify we start in Live mode
    await expect(
      page.locator(".alerts-page__mode-button--active", { hasText: /live/i }),
    ).toBeVisible();

    // Switch to Historical mode
    await page
      .locator(".alerts-page__mode-button", { hasText: /historical/i })
      .click();

    // Historical mode button should now be active
    await expect(
      page.locator(".alerts-page__mode-button--active", {
        hasText: /historical/i,
      }),
    ).toBeVisible();

    // The term selector control group should be visible
    await expect(page.locator(".alerts-page__controls")).toBeVisible();

    // The select element should be present with the configured terms as options
    const termSelect = page.locator("#alert-term-select");
    await expect(termSelect).toBeVisible();
    await expect(
      termSelect.locator("option", { hasText: "UAL123" }),
    ).toHaveCount(1);
    await expect(
      termSelect.locator("option", { hasText: "DAL456" }),
    ).toHaveCount(1);
  });

  // -------------------------------------------------------------------------
  // 6. Historical mode — results appear when socket event is received
  // -------------------------------------------------------------------------

  test("displays historical results when alerts_by_term_results event is received", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator("header.navigation")).toBeVisible();

    const termsInjected = await injectAlertTerms(page, ["UAL123"]);
    expect(termsInjected).toBe(true);

    // Navigate via client-side routing so the socket subscription is registered
    await navigateToAlerts(page);

    // Switch to Historical — this immediately sets isSearching=true and emits
    // a queryAlertsByTerm socket event (which goes nowhere in the frontend-only
    // E2E environment) and shows the loading indicator.
    await page
      .locator(".alerts-page__mode-button", { hasText: /historical/i })
      .click();

    // The loading indicator should appear while awaiting results
    await expect(page.locator(".alerts-page__loading")).toBeVisible();

    // Inject the historical results via the socket service
    const emitted = await emitAlertsByTermResults(page, HISTORICAL_TWO);
    // E2E build required for socket injection
    expect(emitted).toBe(true);

    // Loading state should clear
    await expect(page.locator(".alerts-page__loading")).not.toBeVisible();

    // Two result cards should be rendered
    await expect(page.locator(".alerts-page__result-card")).toHaveCount(2);

    // Stats bar (historical mode) should show the total result count
    await expect(page.locator(".page__stats")).toContainText(/2.*result/i);
  });

  // -------------------------------------------------------------------------
  // 7. Historical mode — empty results shows "no historical results"
  // -------------------------------------------------------------------------

  test("shows 'no historical results' when historical search returns zero results", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator("header.navigation")).toBeVisible();

    const termsInjected = await injectAlertTerms(page, ["UAL123"]);
    expect(termsInjected).toBe(true);

    // Navigate via client-side routing so the socket subscription is registered
    await navigateToAlerts(page);

    // Switch to Historical — starts searching immediately
    await page
      .locator(".alerts-page__mode-button", { hasText: /historical/i })
      .click();

    // Wait for the loading indicator
    await expect(page.locator(".alerts-page__loading")).toBeVisible();

    // Inject an empty result set via the socket service
    const emitted = await emitAlertsByTermResults(page, HISTORICAL_EMPTY);
    expect(emitted).toBe(true);

    // Loading state should clear
    await expect(page.locator(".alerts-page__loading")).not.toBeVisible();

    // No result cards
    await expect(page.locator(".alerts-page__result-card")).not.toBeVisible();

    // "No Historical Results" empty state heading should appear
    await expect(
      page.getByRole("heading", { name: /no historical results/i }),
    ).toBeVisible();
  });
});
