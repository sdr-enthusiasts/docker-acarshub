import { expect, type Page, test } from "@playwright/test";

// ---------------------------------------------------------------------------
// Types (mirrored from @acarshub/types — kept minimal for E2E use)
// ---------------------------------------------------------------------------

interface MinimalAcarsMsg {
  uid: string;
  message_type: string;
  timestamp: number;
  station_id: string;
  flight?: string;
  tail?: string;
  text?: string;
  label?: string;
}

interface SearchHtmlMsg {
  msghtml: MinimalAcarsMsg[];
  query_time: number;
  num_results: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Simulate a `database_search_results` server event arriving over Socket.IO.
 *
 * Calls `socketService.fireLocalEvent()` which fires all handlers registered
 * via `socket.on("database_search_results", ...)` without touching the network.
 * The socket service is exposed as `window.__ACARS_SOCKET__` in E2E builds
 * (`VITE_E2E=true`).
 *
 * Returns true if the service was reachable within 5 seconds, false otherwise.
 */
async function emitSearchResults(
  page: Page,
  payload: SearchHtmlMsg,
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
    { event: "database_search_results", data: payload },
  );
}

// ---------------------------------------------------------------------------
// Shared message fixtures
// ---------------------------------------------------------------------------

/** Two messages returned from a flight-number search. */
const RESULTS_TWO: SearchHtmlMsg = {
  msghtml: [
    {
      uid: "search-e2e-1",
      message_type: "acars",
      timestamp: 1_700_000_100,
      station_id: "E2E-TEST",
      flight: "UAL123",
      text: "ATIS INFORMATION BRAVO",
      label: "H1",
    },
    {
      uid: "search-e2e-2",
      message_type: "acars",
      timestamp: 1_700_000_000,
      station_id: "E2E-TEST",
      flight: "UAL123",
      text: "POS N40 W090 FL350",
      label: "H1",
    },
  ],
  query_time: 0.042,
  num_results: 2,
};

/** Empty result set — no messages matched the query. */
const RESULTS_EMPTY: SearchHtmlMsg = {
  msghtml: [],
  query_time: 0.001,
  num_results: 0,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Navigate to the Search page via client-side routing.
 *
 * Background: `SearchPage` subscribes to `database_search_results` inside a
 * `useEffect` that guards with `socketService.isInitialized()`.  React runs
 * child effects before parent effects, so if we do `page.goto("/search")`
 * directly the guard fires before `useSocketIO` (in `App`) has called
 * `socketService.connect()` — the subscription is never registered and
 * `emitSearchResults` has no callbacks to call.
 *
 * Workaround: load the app at `/` first (which initialises the socket via
 * `useSocketIO`), then navigate to `/search` via a nav-link click so the
 * search page mounts into an already-running React tree where
 * `isInitialized()` is already true.
 */
async function goToSearchPage(page: Page): Promise<void> {
  // Load app root — React Router immediately redirects to /live-messages;
  // useSocketIO runs and calls socketService.connect() as part of App mount.
  await page.goto("/");
  await expect(page.locator("header.navigation")).toBeVisible();

  // On mobile the nav links are inside the hamburger menu.
  const mobileMenu = page.locator("details.small_nav");
  if (await mobileMenu.isVisible()) {
    await page.locator("details.small_nav > summary").click();
  }

  // Client-side navigation: SearchPage mounts into an already-running tree
  // so its useEffect fires after socketService is initialised → subscription
  // is correctly registered.
  await Promise.all([
    page.waitForURL(/\/search/, { timeout: 15000 }),
    page
      .getByRole("link", { name: /search database/i })
      .first()
      .click(),
  ]);

  await expect(
    page.getByRole("heading", { name: /search database/i }),
  ).toBeVisible();
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

test.describe("Search Page", () => {
  test.beforeEach(async ({ page }) => {
    await goToSearchPage(page);
  });

  // -------------------------------------------------------------------------
  // 1. Form structure
  // -------------------------------------------------------------------------

  test("renders all search form fields", async ({ page }) => {
    // Key fields identified by their label text
    await expect(page.getByLabel(/^flight$/i)).toBeVisible();
    await expect(page.getByLabel(/tail number/i)).toBeVisible();
    await expect(page.getByLabel(/icao hex/i)).toBeVisible();
    await expect(page.getByLabel(/departure/i)).toBeVisible();
    await expect(page.getByLabel(/destination/i)).toBeVisible();
    await expect(page.getByLabel(/frequency/i)).toBeVisible();
    await expect(page.getByLabel(/message label/i)).toBeVisible();
    await expect(page.getByLabel(/message text/i)).toBeVisible();

    // Form action buttons
    await expect(page.getByRole("button", { name: /^search$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /clear/i })).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // 2. Submitting an empty form does not trigger a search
  // -------------------------------------------------------------------------

  test("does not trigger a search when all fields are empty", async ({
    page,
  }) => {
    // Click Search with no fields filled
    await page.getByRole("button", { name: /^search$/i }).click();

    // The button should NOT change to "Searching..." (the empty guard fires)
    // Wait a brief moment to confirm no state change occurs
    await page.waitForTimeout(300);
    await expect(page.getByRole("button", { name: /^search$/i })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /searching/i }),
    ).not.toBeVisible();

    // No results or "no results" copy should appear
    await expect(page.locator(".search-page__results")).not.toBeVisible();
    await expect(page.locator(".search-page__empty")).not.toBeVisible();
  });

  // -------------------------------------------------------------------------
  // 3. Submitting a non-empty form shows the loading state
  // -------------------------------------------------------------------------

  test("shows loading state while search is in progress", async ({ page }) => {
    // Fill in the Flight field
    await page.getByLabel(/^flight$/i).fill("UAL123");

    // Click Search (immediate, no debounce)
    await page.getByRole("button", { name: /^search$/i }).click();

    // The submit button should show "Searching..." while awaiting results
    await expect(
      page.getByRole("button", { name: /searching/i }),
    ).toBeVisible();

    // The button should be disabled while searching
    await expect(
      page.getByRole("button", { name: /searching/i }),
    ).toBeDisabled();
  });

  // -------------------------------------------------------------------------
  // 4. Results appear when the socket event is fired
  // -------------------------------------------------------------------------

  test("displays results when database_search_results event is received", async ({
    page,
  }) => {
    // Fill and submit the search form
    await page.getByLabel(/^flight$/i).fill("UAL123");
    await page.getByRole("button", { name: /^search$/i }).click();

    // Wait for the loading state so we know the handler is active
    await expect(
      page.getByRole("button", { name: /searching/i }),
    ).toBeVisible();

    // Inject the search results via the socket service
    const emitted = await emitSearchResults(page, RESULTS_TWO);
    // E2E build required for socket injection
    expect(emitted).toBe(true);

    // Loading state should clear
    await expect(page.getByRole("button", { name: /^search$/i })).toBeVisible();

    // Results count should be shown
    await expect(page.locator(".search-page__results-info")).toContainText(
      "Found",
    );
    await expect(page.locator(".search-page__results-info")).toContainText("2");

    // Exactly 2 result cards should be rendered
    await expect(page.locator(".search-page__result-card")).toHaveCount(2);
  });

  // -------------------------------------------------------------------------
  // 5. Empty results state
  // -------------------------------------------------------------------------

  test("shows 'no messages found' when search returns zero results", async ({
    page,
  }) => {
    // Fill and submit
    await page.getByLabel(/^flight$/i).fill("ZZZUNKNOWN");
    await page.getByRole("button", { name: /^search$/i }).click();

    await expect(
      page.getByRole("button", { name: /searching/i }),
    ).toBeVisible();

    // Inject empty results
    const emitted = await emitSearchResults(page, RESULTS_EMPTY);
    expect(emitted).toBe(true);

    // Loading clears
    await expect(page.getByRole("button", { name: /^search$/i })).toBeVisible();

    // No result cards
    await expect(page.locator(".search-page__result-card")).not.toBeVisible();

    // "No messages found" copy is visible
    await expect(page.locator(".search-page__empty")).toBeVisible();
    await expect(page.locator(".search-page__empty")).toContainText(
      /no messages found/i,
    );
  });

  // -------------------------------------------------------------------------
  // 6. Clear button resets form and dismisses results
  // -------------------------------------------------------------------------

  test("clear button empties the form and removes results", async ({
    page,
  }) => {
    // Fill in multiple fields
    await page.getByLabel(/^flight$/i).fill("UAL123");
    await page.getByLabel(/tail number/i).fill("N12345");

    // Submit and inject results
    await page.getByRole("button", { name: /^search$/i }).click();
    await expect(
      page.getByRole("button", { name: /searching/i }),
    ).toBeVisible();
    const emitted = await emitSearchResults(page, RESULTS_TWO);
    expect(emitted).toBe(true);

    // Verify results are showing before clearing
    await expect(page.locator(".search-page__result-card")).toHaveCount(2);

    // Click Clear
    await page.getByRole("button", { name: /clear/i }).click();

    // Both fields should be empty
    await expect(page.getByLabel(/^flight$/i)).toHaveValue("");
    await expect(page.getByLabel(/tail number/i)).toHaveValue("");

    // Results and info should be gone
    await expect(page.locator(".search-page__results")).not.toBeVisible();
    await expect(page.locator(".search-page__results-info")).not.toBeVisible();
    await expect(page.locator(".search-page__empty")).not.toBeVisible();
  });
});
