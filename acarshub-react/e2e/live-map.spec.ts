// Copyright (C) 2022-2026 Frederick Clausen II
// This file is part of acarshub <https://github.com/sdr-enthusiasts/docker-acarshub>.

// acarshub is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// acarshub is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with acarshub.  If not, see <http://www.gnu.org/licenses/>.

import { expect, type Page, test } from "@playwright/test";

// ---------------------------------------------------------------------------
// Types (mirroring acarshub-types, serialisable for page.evaluate)
// ---------------------------------------------------------------------------

interface MinimalADSBAircraft {
  hex: string;
  flight?: string;
  r?: string; // tail/registration
  lat?: number;
  lon?: number;
  alt_baro?: number;
  gs?: number;
  track?: number;
}

interface MinimalADSBData {
  now: number;
  aircraft: MinimalADSBAircraft[];
}

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Inject ADS-B aircraft data directly into the Zustand app store.
 *
 * Returns true if the store was reachable and setAdsbAircraft was called,
 * false on timeout (non-E2E build or store not yet mounted).
 */
async function injectAdsbData(
  page: Page,
  data: MinimalADSBData,
): Promise<boolean> {
  return page.evaluate((d) => {
    return new Promise<boolean>((resolve) => {
      const deadline = Date.now() + 5000;

      const tryInject = () => {
        // biome-ignore lint/suspicious/noExplicitAny: Required for E2E testing window access
        const store = (window as any).__ACARS_STORE__;
        if (store) {
          store.getState().setAdsbAircraft(d);
          resolve(true);
        } else if (Date.now() >= deadline) {
          resolve(false);
        } else {
          setTimeout(tryInject, 50);
        }
      };

      tryInject();
    });
  }, data);
}

/**
 * Inject an ACARS message directly into the Zustand app store.
 *
 * Used to test aircraft pairing (ADS-B + ACARS) on the Live Map.
 */
async function injectAcarsMessage(
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
 * Navigate to the Live Map page.
 *
 * LiveMapPage only reads from the Zustand store — it does not register any
 * socket event subscriptions of its own.  There is therefore no Socket.IO
 * subscription-ordering race (unlike SearchPage / AlertsPage), so we can
 * navigate directly to /adsb via page.goto() without first loading the root.
 *
 * Using page.goto() also sidesteps the mobile hamburger-menu issue: the "Live
 * Map" NavLink is only rendered when adsbEnabled === true in the store, which
 * requires injecting decoder state and waiting for a React re-render before
 * the link is click-able.  A direct URL navigation is simpler and more robust.
 */
async function navigateToLiveMap(page: Page): Promise<void> {
  await page.goto("/adsb");

  // Wait for the app shell and the aircraft list sidebar to be present.
  await expect(page.locator("header.navigation")).toBeVisible();
  await expect(page.locator(".aircraft-list")).toBeVisible();
}

// ---------------------------------------------------------------------------
// Shared ADS-B fixture aircraft
// ---------------------------------------------------------------------------

/** A single aircraft with a known callsign, position, and altitude. */
const AIRCRAFT_UAL: MinimalADSBAircraft = {
  hex: "a1b2c3",
  flight: "UAL123",
  lat: 40.7128,
  lon: -74.006,
  alt_baro: 35000,
  gs: 450,
  track: 90,
};

/** A second aircraft from a different airline. */
const AIRCRAFT_DAL: MinimalADSBAircraft = {
  hex: "d4e5f6",
  flight: "DAL456",
  lat: 34.0522,
  lon: -118.2437,
  alt_baro: 28000,
  gs: 420,
  track: 270,
};

/** A third aircraft used to verify multi-aircraft counts. */
const AIRCRAFT_SWA: MinimalADSBAircraft = {
  hex: "789abc",
  flight: "SWA789",
  lat: 41.8781,
  lon: -87.6298,
  alt_baro: 32000,
  gs: 380,
};

/** ACARS message whose flight field matches AIRCRAFT_UAL.flight. */
const ACARS_FOR_UAL: MinimalAcarsMsg = {
  uid: "e2e-livemap-acars-ual-1",
  message_type: "acars",
  timestamp: 1_700_000_000,
  station_id: "E2E-TEST",
  flight: "UAL123",
  text: "POS N40 W074 AT 1200Z FL350",
  label: "H1",
  matched: false,
  matched_text: [],
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

/**
 * GAP-E2E-6: Live Map interaction tests
 *
 * These tests focus on the AircraftList sidebar that is always visible
 * regardless of whether the MapLibre canvas has finished loading map tiles.
 * The canvas itself is WebGL-based and not directly testable in headless
 * mode; the sidebar drives all user-facing interactions that matter:
 *   - Empty state copy
 *   - Aircraft rows appear when ADS-B data is injected
 *   - Aircraft count in the header stat
 *   - Pause / resume freezes and restores the live view
 *   - Text filter narrows the visible aircraft
 *   - ACARS badge appears for aircraft paired with a message group
 *   - Alert badge appears for aircraft whose paired group has alerts
 *
 * All ADS-B data and ACARS messages are injected directly into the Zustand
 * store (window.__ACARS_STORE__) — no real backend is required.
 */
test.describe("Live Map (GAP-E2E-6)", () => {
  // The AircraftList sidebar is CSS-hidden on mobile viewports (< 768 px) via
  //   @include breakpoint-max(md) { display: none; }
  // in _live-map.scss.  All tests in this suite interact with the sidebar, so
  // they would always fail on Mobile Chrome / Mobile Safari.  Skip them there.
  test.skip(({ viewport }) => {
    const width = viewport?.width ?? 1280;
    return width <= 768;
  }, "AircraftList sidebar is CSS-hidden on mobile viewports (≤768 px)");

  // Navigate to the Live Map before each test.
  test.beforeEach(async ({ page }) => {
    await navigateToLiveMap(page);
  });

  // -------------------------------------------------------------------------
  // 1. Aircraft list sidebar is present on page load
  // -------------------------------------------------------------------------

  test("aircraft list sidebar renders on the Live Map page", async ({
    page,
  }) => {
    // The sidebar container must be visible.
    await expect(page.locator(".aircraft-list")).toBeVisible();

    // The header area with the stats and pause button must be present.
    await expect(page.locator(".aircraft-list__header")).toBeVisible();

    // The filter input must be present.
    await expect(page.locator(".aircraft-list__search")).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // 2. Empty state when no ADS-B data has arrived
  // -------------------------------------------------------------------------

  test("shows empty state and zero aircraft count when no data is present", async ({
    page,
  }) => {
    // The aircraft count badge in the header should read "0".
    const statText = page.locator(".aircraft-list__stat").first();
    await expect(statText).toContainText("0");

    // The empty state placeholder should be visible.
    await expect(page.locator(".aircraft-list__empty")).toBeVisible();
    await expect(page.locator(".aircraft-list__empty")).toContainText(
      "No aircraft found",
    );

    // No table rows should be in the DOM.
    await expect(page.locator(".aircraft-list__row")).not.toBeVisible();
  });

  // -------------------------------------------------------------------------
  // 3. Single aircraft appears after ADS-B injection
  // -------------------------------------------------------------------------

  test("aircraft row appears after injecting a single ADS-B aircraft", async ({
    page,
  }) => {
    const injected = await injectAdsbData(page, {
      now: 1_700_000_000,
      aircraft: [AIRCRAFT_UAL],
    });
    expect(injected).toBe(true);

    // The empty state should be replaced by the table.
    await expect(page.locator(".aircraft-list__empty")).not.toBeVisible();

    // One row should exist for UAL123.
    await expect(
      page.locator(".aircraft-list__callsign", { hasText: "UAL123" }),
    ).toBeVisible();

    // The header count should read "1".
    await expect(
      page.locator(".aircraft-list__stat strong").first(),
    ).toHaveText("1");
  });

  // -------------------------------------------------------------------------
  // 4. Multiple aircraft all appear in the list
  // -------------------------------------------------------------------------

  test("all injected aircraft appear as separate rows", async ({ page }) => {
    const injected = await injectAdsbData(page, {
      now: 1_700_000_000,
      aircraft: [AIRCRAFT_UAL, AIRCRAFT_DAL, AIRCRAFT_SWA],
    });
    expect(injected).toBe(true);

    // Three rows should be present.
    await expect(page.locator(".aircraft-list__row")).toHaveCount(3);

    // Each callsign must be individually visible.
    await expect(
      page.locator(".aircraft-list__callsign", { hasText: "UAL123" }),
    ).toBeVisible();
    await expect(
      page.locator(".aircraft-list__callsign", { hasText: "DAL456" }),
    ).toBeVisible();
    await expect(
      page.locator(".aircraft-list__callsign", { hasText: "SWA789" }),
    ).toBeVisible();

    // Header stat should reflect all three.
    await expect(
      page.locator(".aircraft-list__stat strong").first(),
    ).toHaveText("3");
  });

  // -------------------------------------------------------------------------
  // 5. Pause button toggles the UI state
  // -------------------------------------------------------------------------

  test("pause button icon changes when clicked", async ({ page }) => {
    // Inject at least one aircraft so the list is not empty.
    await injectAdsbData(page, {
      now: 1_700_000_000,
      aircraft: [AIRCRAFT_UAL],
    });
    await expect(
      page.locator(".aircraft-list__callsign", { hasText: "UAL123" }),
    ).toBeVisible();

    // The pause button should show the ⏸ icon initially.
    const pauseBtn = page.locator(".aircraft-list__pause-button");
    await expect(pauseBtn).toBeVisible();
    await expect(pauseBtn).toContainText("⏸");

    // Click to pause.
    await pauseBtn.click();

    // Button should now show the ▶ resume icon.
    await expect(pauseBtn).toContainText("▶");
    // The paused modifier class should be applied.
    await expect(pauseBtn).toHaveClass(/aircraft-list__pause-button--paused/);
  });

  // -------------------------------------------------------------------------
  // 6. Pausing freezes the list; new aircraft do not appear while paused
  // -------------------------------------------------------------------------

  test("pausing the list prevents new aircraft from appearing", async ({
    page,
  }) => {
    // Start with one aircraft.
    await injectAdsbData(page, {
      now: 1_700_000_000,
      aircraft: [AIRCRAFT_UAL],
    });
    await expect(
      page.locator(".aircraft-list__callsign", { hasText: "UAL123" }),
    ).toBeVisible();

    // Pause updates via the sidebar button.
    await page.locator(".aircraft-list__pause-button").click();
    await expect(page.locator(".aircraft-list__pause-button")).toContainText(
      "▶",
    );

    // Inject a second aircraft while paused.
    const injected = await injectAdsbData(page, {
      now: 1_700_000_001,
      aircraft: [AIRCRAFT_UAL, AIRCRAFT_DAL],
    });
    expect(injected).toBe(true);

    // DAL456 must NOT appear in the frozen snapshot.
    await expect(
      page.locator(".aircraft-list__callsign", { hasText: "DAL456" }),
    ).not.toBeVisible();

    // UAL123 from the snapshot must still be present.
    await expect(
      page.locator(".aircraft-list__callsign", { hasText: "UAL123" }),
    ).toBeVisible();

    // Count still reflects the frozen snapshot (1 aircraft).
    await expect(
      page.locator(".aircraft-list__stat strong").first(),
    ).toHaveText("1");
  });

  // -------------------------------------------------------------------------
  // 7. Resuming restores the live view with all current aircraft
  // -------------------------------------------------------------------------

  test("resuming updates the list to include all aircraft injected while paused", async ({
    page,
  }) => {
    // Start with UAL123.
    await injectAdsbData(page, {
      now: 1_700_000_000,
      aircraft: [AIRCRAFT_UAL],
    });
    await expect(
      page.locator(".aircraft-list__callsign", { hasText: "UAL123" }),
    ).toBeVisible();

    // Pause.
    await page.locator(".aircraft-list__pause-button").click();

    // Inject DAL456 while paused.
    await injectAdsbData(page, {
      now: 1_700_000_001,
      aircraft: [AIRCRAFT_UAL, AIRCRAFT_DAL],
    });
    await expect(
      page.locator(".aircraft-list__callsign", { hasText: "DAL456" }),
    ).not.toBeVisible();

    // Resume.
    await page.locator(".aircraft-list__pause-button").click();
    await expect(page.locator(".aircraft-list__pause-button")).toContainText(
      "⏸",
    );

    // Both aircraft should now appear in the live view.
    await expect(
      page.locator(".aircraft-list__callsign", { hasText: "UAL123" }),
    ).toBeVisible();
    await expect(
      page.locator(".aircraft-list__callsign", { hasText: "DAL456" }),
    ).toBeVisible();

    // Count now reflects the live data.
    await expect(
      page.locator(".aircraft-list__stat strong").first(),
    ).toHaveText("2");
  });

  // -------------------------------------------------------------------------
  // 8. Keyboard shortcut 'p' toggles pause state
  //
  // This shortcut is handled by a document-level keydown listener in
  // LiveMapPage.  Only reliable on Chromium in Playwright's synthetic-key
  // dispatch; skipped on other browsers where synthetic key events may not
  // propagate through document listeners consistently.
  // -------------------------------------------------------------------------

  test("pressing 'p' toggles the pause state via keyboard shortcut", async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== "chromium",
      "Keyboard shortcut test only reliable on Chromium",
    );

    await injectAdsbData(page, {
      now: 1_700_000_000,
      aircraft: [AIRCRAFT_UAL],
    });
    await expect(
      page.locator(".aircraft-list__callsign", { hasText: "UAL123" }),
    ).toBeVisible();

    const pauseBtn = page.locator(".aircraft-list__pause-button");

    // Press 'p' — should pause.
    await page.keyboard.press("p");
    await expect(pauseBtn).toContainText("▶");

    // Press 'p' again — should resume.
    await page.keyboard.press("p");
    await expect(pauseBtn).toContainText("⏸");
  });

  // -------------------------------------------------------------------------
  // 9. Text filter narrows the visible aircraft list
  // -------------------------------------------------------------------------

  test("text filter shows only aircraft matching the search query", async ({
    page,
  }) => {
    // Inject two aircraft with different callsigns.
    await injectAdsbData(page, {
      now: 1_700_000_000,
      aircraft: [AIRCRAFT_UAL, AIRCRAFT_DAL],
    });
    await expect(page.locator(".aircraft-list__row")).toHaveCount(2);

    // Type in the filter box — filter to "UAL" prefix.
    await page.locator(".aircraft-list__search").fill("UAL");

    // Only UAL123 should match.
    await expect(page.locator(".aircraft-list__row")).toHaveCount(1);
    await expect(
      page.locator(".aircraft-list__callsign", { hasText: "UAL123" }),
    ).toBeVisible();

    // DAL456 must be hidden.
    await expect(
      page.locator(".aircraft-list__callsign", { hasText: "DAL456" }),
    ).not.toBeVisible();

    // Clearing the filter restores both aircraft.
    await page.locator(".aircraft-list__search").clear();
    await expect(page.locator(".aircraft-list__row")).toHaveCount(2);
  });

  // -------------------------------------------------------------------------
  // 10. ACARS badge appears for aircraft paired with a message group
  //
  // pairADSBWithACARSMessages() matches ADS-B aircraft to ACARS message groups
  // using (in priority order) hex, flight number, or tail number.  Here we
  // match by flight number (UAL123) and verify the ✓ badge renders.
  // -------------------------------------------------------------------------

  test("ACARS message badge (✓) appears on aircraft with paired ACARS messages", async ({
    page,
  }) => {
    // Inject an ACARS message for UAL123 into the message store FIRST.
    // addMessage() builds a MessageGroup keyed by the flight identifier.
    const msgInjected = await injectAcarsMessage(page, ACARS_FOR_UAL);
    expect(msgInjected).toBe(true);

    // Now inject ADS-B data with the same callsign.
    // LiveMapPage calls pairADSBWithACARSMessages() which checks
    // group.identifiers.includes(adsbKeys.flight) — should find UAL123.
    const adsbInjected = await injectAdsbData(page, {
      now: 1_700_000_000,
      aircraft: [AIRCRAFT_UAL],
    });
    expect(adsbInjected).toBe(true);

    // The UAL123 row should be visible.
    await expect(
      page.locator(".aircraft-list__callsign", { hasText: "UAL123" }),
    ).toBeVisible();

    // The ✓ ACARS badge must appear inside the callsign cell for UAL123.
    const ualRow = page.locator(".aircraft-list__row").filter({
      has: page.locator(".aircraft-list__callsign", { hasText: "UAL123" }),
    });
    await expect(
      ualRow.locator(".aircraft-list__badge--messages"),
    ).toBeVisible();
    await expect(
      ualRow.locator(".aircraft-list__badge--messages"),
    ).toContainText("✓");

    // A second aircraft without ACARS messages must NOT have the badge.
    const adsbInjected2 = await injectAdsbData(page, {
      now: 1_700_000_001,
      aircraft: [AIRCRAFT_UAL, AIRCRAFT_DAL],
    });
    expect(adsbInjected2).toBe(true);

    const dalRow = page.locator(".aircraft-list__row").filter({
      has: page.locator(".aircraft-list__callsign", { hasText: "DAL456" }),
    });
    await expect(dalRow).toBeVisible();
    await expect(
      dalRow.locator(".aircraft-list__badge--messages"),
    ).not.toBeVisible();
  });
});
