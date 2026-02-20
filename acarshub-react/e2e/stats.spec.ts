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
// Types (minimal subset of what the store accepts)
// ---------------------------------------------------------------------------

interface StatusDecoder {
  [name: string]: {
    Status: string;
    Connected?: boolean;
    Alive?: boolean;
  };
}

interface StatusServer {
  [name: string]: {
    Status: string;
    Messages: number;
  };
}

interface StatusGlobal {
  [name: string]: {
    Status: string;
    Count: number;
    LastMinute?: number;
  };
}

interface SystemStatus {
  status: {
    error_state: boolean;
    decoders: StatusDecoder;
    servers: StatusServer;
    global: StatusGlobal;
    stats: StatusDecoder;
    external_formats: Record<string, unknown>;
    errors?: { Total: number; LastMinute: number };
    threads?: { database: boolean; scheduler: boolean };
  };
}

interface Decoders {
  acars: boolean;
  vdlm: boolean;
  hfdl: boolean;
  imsl: boolean;
  irdm: boolean;
  allow_remote_updates: boolean;
  adsb: { enabled: boolean; lat: number; lon: number; range_rings: boolean };
}

// ---------------------------------------------------------------------------
// Store injection helpers
// ---------------------------------------------------------------------------

/**
 * Inject a SystemStatus value into the Zustand app store.
 * Returns true if the store was available, false if it timed out (non-E2E build).
 */
async function injectSystemStatus(
  page: Page,
  status: SystemStatus,
): Promise<boolean> {
  return page.evaluate((s) => {
    return new Promise<boolean>((resolve) => {
      const deadline = Date.now() + 5000;

      const tryInject = () => {
        // biome-ignore lint/suspicious/noExplicitAny: Required for E2E testing window access
        const store = (window as any).__ACARS_STORE__;
        if (store) {
          store.getState().setSystemStatus(s);
          resolve(true);
        } else if (Date.now() >= deadline) {
          resolve(false);
        } else {
          setTimeout(tryInject, 50);
        }
      };

      tryInject();
    });
  }, status);
}

/**
 * Inject decoder configuration into the store so the decoder tabs are populated.
 */
async function injectDecoders(
  page: Page,
  decoders: Decoders,
): Promise<boolean> {
  return page.evaluate((d) => {
    return new Promise<boolean>((resolve) => {
      const deadline = Date.now() + 5000;

      const tryInject = () => {
        // biome-ignore lint/suspicious/noExplicitAny: Required for E2E testing window access
        const store = (window as any).__ACARS_STORE__;
        if (store) {
          store.getState().setDecoders(d);
          resolve(true);
        } else if (Date.now() >= deadline) {
          resolve(false);
        } else {
          setTimeout(tryInject, 50);
        }
      };

      tryInject();
    });
  }, decoders);
}

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

/** A healthy system status with one decoder, one server, and one global counter. */
const STATUS_HEALTHY: SystemStatus = {
  status: {
    error_state: false,
    decoders: {
      ACARS: { Status: "Ok", Connected: true, Alive: true },
    },
    servers: {
      "TCP/131.5": { Status: "Ok", Messages: 1234 },
    },
    global: {
      ACARS: { Status: "Ok", Count: 9999, LastMinute: 3 },
    },
    stats: {},
    external_formats: {},
    threads: { database: true, scheduler: true },
    errors: { Total: 0, LastMinute: 0 },
  },
};

/** A system status that reports an error condition. */
const STATUS_ERROR: SystemStatus = {
  status: {
    error_state: true,
    decoders: {
      ACARS: { Status: "Dead", Connected: false, Alive: false },
    },
    servers: {
      "TCP/131.5": { Status: "Disconnected", Messages: 0 },
    },
    global: {
      ACARS: { Status: "Dead", Count: 0, LastMinute: 0 },
    },
    stats: {},
    external_formats: {},
    threads: { database: false, scheduler: true },
    errors: { Total: 42, LastMinute: 5 },
  },
};

/** Decoder config that enables ACARS and VDLM only. */
const DECODERS_ACARS_VDLM: Decoders = {
  acars: true,
  vdlm: true,
  hfdl: false,
  imsl: false,
  irdm: false,
  allow_remote_updates: false,
  adsb: { enabled: false, lat: 0, lon: 0, range_rings: false },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Stats Page (/status)", () => {
  test.beforeEach(async ({ page }) => {
    // The /status route renders StatsPage directly — no socket subscription
    // race condition applies here, so a direct page.goto is fine.
    await page.goto("/status");
    await expect(page.locator("header.navigation")).toBeVisible();
    // Wait for the page heading to confirm the page has rendered
    await expect(
      page.getByRole("heading", { name: /system status & statistics/i }),
    ).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // 1. Page structure
  // -------------------------------------------------------------------------

  test("renders the page title and all section tabs", async ({ page }) => {
    // Page heading
    await expect(
      page.getByRole("heading", { name: /system status & statistics/i }),
    ).toBeVisible();

    // All 6 section tabs must be present
    const expectedTabs = [
      "Reception Over Time",
      "Signal Levels",
      "Alert Terms",
      "Frequency Distribution",
      "Message Statistics",
      "System Status",
    ];

    for (const tabLabel of expectedTabs) {
      await expect(page.getByRole("tab", { name: tabLabel })).toBeVisible();
    }
  });

  // -------------------------------------------------------------------------
  // 2. Default section is "Reception Over Time"
  // -------------------------------------------------------------------------

  test("default active section is Reception Over Time", async ({ page }) => {
    // The "Reception Over Time" tab should be selected by default
    await expect(
      page.getByRole("tab", { name: "Reception Over Time", selected: true }),
    ).toBeVisible();

    // The time-period sub-tab switcher for 1 Hour / 24 Hours etc. should be present
    await expect(page.getByRole("tab", { name: "24 Hours" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "1 Hour" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "1 Week" })).toBeVisible();

    // The section heading should be visible
    await expect(
      page.getByRole("heading", { name: /message reception over time/i }),
    ).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // 3. Tab switching: Signal Levels section
  // -------------------------------------------------------------------------

  test("switching to Signal Levels tab shows signal level content", async ({
    page,
  }) => {
    // Click Signal Levels tab
    await page.getByRole("tab", { name: "Signal Levels" }).click();

    // Tab should become active
    await expect(
      page.getByRole("tab", { name: "Signal Levels", selected: true }),
    ).toBeVisible();

    // Section heading should change
    await expect(
      page.getByRole("heading", { name: /signal levels/i }),
    ).toBeVisible();

    // Time-period sub-tabs should no longer be visible (they belong to Reception only)
    await expect(page.getByRole("tab", { name: "24 Hours" })).not.toBeVisible();
  });

  // -------------------------------------------------------------------------
  // 4. Time-period sub-tab switching in Reception Over Time
  // -------------------------------------------------------------------------

  test("time period sub-tabs switch the selected period", async ({ page }) => {
    // Reception Over Time is the default section — time period tabs are visible
    await expect(
      page.getByRole("tab", { name: "24 Hours", selected: true }),
    ).toBeVisible();

    // Click "1 Hour"
    await page.getByRole("tab", { name: "1 Hour" }).click();

    // "1 Hour" should now be the selected time period
    await expect(
      page.getByRole("tab", { name: "1 Hour", selected: true }),
    ).toBeVisible();

    // "24 Hours" should no longer be selected
    await expect(
      page.getByRole("tab", { name: "24 Hours", selected: true }),
    ).not.toBeVisible();
  });

  // -------------------------------------------------------------------------
  // 5. System Status tab: loading state (no systemStatus in store)
  // -------------------------------------------------------------------------

  test("System Status tab shows loading state when no status is available", async ({
    page,
  }) => {
    // Navigate to System Status tab
    await page.getByRole("tab", { name: "System Status" }).click();

    await expect(
      page.getByRole("tab", { name: "System Status", selected: true }),
    ).toBeVisible();

    // Should show the loading placeholder
    await expect(page.locator("text=Loading system status...")).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // 6. System Status tab: healthy status shows "All Systems Operational"
  // -------------------------------------------------------------------------

  test("System Status tab shows All Systems Operational for healthy status", async ({
    page,
  }) => {
    // Inject healthy status before navigating to the tab
    const injected = await injectSystemStatus(page, STATUS_HEALTHY);
    expect(injected).toBe(true);

    // Navigate to System Status tab
    await page.getByRole("tab", { name: "System Status" }).click();

    // Overview banner
    await expect(
      page.getByRole("heading", { name: /all systems operational/i }),
    ).toBeVisible();

    // Decoder card should list "ACARS" decoder
    await expect(
      page.getByRole("heading", { name: /decoder status/i }),
    ).toBeVisible();
    await expect(
      page.locator(".status-item__name", { hasText: "ACARS" }).first(),
    ).toBeVisible();

    // Server card should list the server
    await expect(
      page.getByRole("heading", { name: /server status/i }),
    ).toBeVisible();

    // System Threads section should show both threads as Ok
    await expect(
      page.getByRole("heading", { name: /system threads/i }),
    ).toBeVisible();
    await expect(
      page.locator(".status-item__name", { hasText: "Database Thread" }),
    ).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // 7. System Status tab: error state shows "System Error Detected"
  // -------------------------------------------------------------------------

  test("System Status tab shows System Error Detected for error state", async ({
    page,
  }) => {
    // Inject the error status
    const injected = await injectSystemStatus(page, STATUS_ERROR);
    expect(injected).toBe(true);

    // Navigate to System Status tab
    await page.getByRole("tab", { name: "System Status" }).click();

    // Overview banner should indicate an error
    await expect(
      page.getByRole("heading", { name: /system error detected/i }),
    ).toBeVisible();

    // The status badge for the ACARS decoder should show "Dead"
    await expect(
      page.locator(".status-badge", { hasText: "Dead" }).first(),
    ).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // 8. Frequency Distribution: no decoders → "No frequency data available"
  // -------------------------------------------------------------------------

  test("Frequency Distribution shows no-data message when no decoders are enabled", async ({
    page,
  }) => {
    // No decoders injected — decoders state is null by default, so
    // frequencyDecoderTabs is empty and the "no decoders" branch renders.

    await page.getByRole("tab", { name: "Frequency Distribution" }).click();

    await expect(
      page.getByRole("tab", { name: "Frequency Distribution", selected: true }),
    ).toBeVisible();

    await expect(
      page.getByRole("heading", { name: /frequency distribution/i }),
    ).toBeVisible();

    await expect(
      page.locator("text=No frequency data available"),
    ).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // 9. Frequency Distribution: decoder tabs appear when decoders are injected
  // -------------------------------------------------------------------------

  test("Frequency Distribution shows decoder tabs when ACARS and VDLM are enabled", async ({
    page,
  }) => {
    // Inject decoder config with ACARS + VDLM enabled
    const injected = await injectDecoders(page, DECODERS_ACARS_VDLM);
    expect(injected).toBe(true);

    await page.getByRole("tab", { name: "Frequency Distribution" }).click();

    await expect(
      page.getByRole("tab", { name: "Frequency Distribution", selected: true }),
    ).toBeVisible();

    // The decoder selector pills should include ACARS and VDLM tabs
    // (these are inside the chart section — scope to the content area to avoid
    // colliding with the outer section tabs that also use role=tab)
    const contentArea = page.locator(".stats-page__section-content");
    await expect(contentArea.getByRole("tab", { name: "ACARS" })).toBeVisible();
    await expect(contentArea.getByRole("tab", { name: "VDLM" })).toBeVisible();

    // HFDL should NOT be present (disabled)
    await expect(
      contentArea.getByRole("tab", { name: "HFDL" }),
    ).not.toBeVisible();
  });

  // -------------------------------------------------------------------------
  // 10. Message Statistics tab renders the section
  // -------------------------------------------------------------------------

  test("Message Statistics tab renders section heading", async ({ page }) => {
    await page.getByRole("tab", { name: "Message Statistics" }).click();

    await expect(
      page.getByRole("tab", { name: "Message Statistics", selected: true }),
    ).toBeVisible();

    await expect(
      page.getByRole("heading", { name: /message statistics/i }),
    ).toBeVisible();
  });
});
