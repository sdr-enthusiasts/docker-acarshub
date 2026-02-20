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
// SPA navigation helper
// ---------------------------------------------------------------------------

/**
 * Navigate to a page using client-side React Router routing.
 *
 * Clicking a NavLink triggers a pushState navigation that preserves Zustand
 * store state — unlike page.goto() which performs a full page reload and
 * resets everything including the simulated connection state.
 *
 * On mobile the nav links are inside the hamburger <details> element; this
 * helper opens it first when necessary.
 */
async function clickNavLink(
  page: Page,
  namePattern: RegExp,
  urlPattern: RegExp,
): Promise<void> {
  const mobileMenu = page.locator("details.small_nav");
  if (await mobileMenu.isVisible()) {
    // Open the hamburger if it is not already open.
    const isOpen = await mobileMenu.evaluate(
      (el: HTMLDetailsElement) => el.open,
    );
    if (!isOpen) {
      await page.locator("details.small_nav > summary").click();
    }
  }
  await Promise.all([
    page.waitForURL(urlPattern, { timeout: 15000 }),
    page.getByRole("link", { name: namePattern }).first().click(),
  ]);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Fire a Socket.IO lifecycle event locally via window.__ACARS_SOCKET__.
 *
 * Waits up to 5 seconds for the socket service to be initialised
 * (socketService.isInitialized() === true) before firing, because
 * socketService.connect() is called from useSocketIO() which runs after
 * the first React render — there is a brief window where the module-level
 * singleton exists but this.socket is still null.
 *
 * Returns true if the event was fired successfully, false on timeout.
 */
async function fireSocketEvent(
  page: Page,
  event: string,
  data: unknown,
): Promise<boolean> {
  return page.evaluate(
    ({ event, data }) => {
      return new Promise<boolean>((resolve) => {
        const deadline = Date.now() + 5000;

        const tryFire = () => {
          // biome-ignore lint/suspicious/noExplicitAny: Required for E2E testing window access
          const socketSvc = (window as any).__ACARS_SOCKET__;
          // Wait until the socket service has called connect() and this.socket
          // is non-null (isInitialized() checks `this.socket !== null`).
          if (socketSvc?.isInitialized()) {
            socketSvc.fireLocalEvent(event, data);
            resolve(true);
          } else if (Date.now() >= deadline) {
            resolve(false);
          } else {
            setTimeout(tryFire, 50);
          }
        };

        tryFire();
      });
    },
    { event, data },
  );
}

/**
 * The ConnectionStatus banner selector.
 * The component renders <div class="connection-status disconnected"> when
 * isConnected === false, and returns null (no DOM element) when connected.
 */
const BANNER = ".connection-status.disconnected";

/**
 * The text inside the banner.
 */
const BANNER_TEXT = ".connection-status-text";

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

/**
 * GAP-E2E-10: Socket.IO reconnection tests
 *
 * These tests verify that the ConnectionStatus banner correctly reflects the
 * real-time Socket.IO connection state stored in useAppStore.isConnected.
 *
 * Because the E2E environment runs against vite preview with no real backend,
 * the socket never actually connects — it attempts a connection and repeatedly
 * fires connect_error. This means:
 *   - isConnected starts as false → banner is shown immediately on load
 *   - We simulate connect / disconnect / reconnect by calling
 *     socketService.fireLocalEvent() via window.__ACARS_SOCKET__, which fires
 *     the callbacks registered with socket.on("connect", ...) etc. Those
 *     callbacks call setConnected(true/false) in the Zustand store, which
 *     causes React to re-render the banner.
 *
 * The tests only verify the UI reaction to connection-state changes; they do
 * NOT test the network layer itself (that is covered by backend integration
 * tests in Phase 5).
 */
test.describe("Socket.IO Reconnection (GAP-E2E-10)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/live-messages");
    // Wait for the app shell to be present before every test.
    await expect(page.locator("header.navigation")).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // 1. Initial disconnected state
  // -------------------------------------------------------------------------

  test("shows disconnected banner immediately on load (no backend in E2E)", async ({
    page,
  }) => {
    // In E2E mode there is no backend, so the socket never fires the `connect`
    // event and isConnected stays false.  The banner must be visible as soon
    // as the app renders.
    await expect(page.locator(BANNER)).toBeVisible();

    // Banner copy should indicate a reconnection attempt is in progress.
    await expect(page.locator(BANNER_TEXT)).toContainText(
      "Disconnected from ACARS Hub backend",
    );
  });

  // -------------------------------------------------------------------------
  // 2. Banner disappears when a `connect` event is received
  // -------------------------------------------------------------------------

  test("banner is hidden after a simulated connect event", async ({ page }) => {
    // Confirm the banner is visible before we do anything.
    await expect(page.locator(BANNER)).toBeVisible();

    // Simulate the Socket.IO `connect` event.  This fires the handler
    // registered in useSocketIO.ts:
    //   socket.on("connect", () => { setConnected(true); })
    // which updates the Zustand store and triggers a re-render.
    const fired = await fireSocketEvent(page, "connect", null);
    expect(fired).toBe(true);

    // ConnectionStatus returns null when isConnected === true, so the element
    // is removed from the DOM entirely.
    await expect(page.locator(BANNER)).not.toBeVisible();
  });

  // -------------------------------------------------------------------------
  // 3. Banner reappears after a `disconnect` event
  // -------------------------------------------------------------------------

  test("banner reappears after a simulated disconnect event", async ({
    page,
  }) => {
    // First establish a "connected" state.
    const connected = await fireSocketEvent(page, "connect", null);
    expect(connected).toBe(true);
    await expect(page.locator(BANNER)).not.toBeVisible();

    // Now simulate the backend going away.
    // The reason string matches Socket.IO disconnect reason conventions.
    const disconnected = await fireSocketEvent(
      page,
      "disconnect",
      "transport close",
    );
    expect(disconnected).toBe(true);

    // The banner must reappear.
    await expect(page.locator(BANNER)).toBeVisible();
    await expect(page.locator(BANNER_TEXT)).toContainText(
      "Disconnected from ACARS Hub backend",
    );
  });

  // -------------------------------------------------------------------------
  // 4. Full disconnect → reconnect cycle
  // -------------------------------------------------------------------------

  test("banner disappears after a reconnect event following a disconnect", async ({
    page,
  }) => {
    // Start connected.
    await fireSocketEvent(page, "connect", null);
    await expect(page.locator(BANNER)).not.toBeVisible();

    // Simulate connection drop.
    await fireSocketEvent(page, "disconnect", "transport error");
    await expect(page.locator(BANNER)).toBeVisible();

    // Simulate successful reconnect.  useSocketIO registers:
    //   socket.on("reconnect", (attemptNumber) => { setConnected(true); })
    // The `reconnect` event payload is the number of attempts taken.
    const reconnected = await fireSocketEvent(page, "reconnect", 1);
    expect(reconnected).toBe(true);

    // Banner must be gone once more.
    await expect(page.locator(BANNER)).not.toBeVisible();
  });

  // -------------------------------------------------------------------------
  // 5. Multiple disconnect / reconnect cycles (resilience)
  // -------------------------------------------------------------------------

  test("banner state tracks multiple disconnect-reconnect cycles correctly", async ({
    page,
  }) => {
    // --- cycle 1 ---
    await fireSocketEvent(page, "connect", null);
    await expect(page.locator(BANNER)).not.toBeVisible();

    await fireSocketEvent(page, "disconnect", "transport close");
    await expect(page.locator(BANNER)).toBeVisible();

    await fireSocketEvent(page, "reconnect", 1);
    await expect(page.locator(BANNER)).not.toBeVisible();

    // --- cycle 2 ---
    await fireSocketEvent(page, "disconnect", "ping timeout");
    await expect(page.locator(BANNER)).toBeVisible();

    await fireSocketEvent(page, "reconnect", 2);
    await expect(page.locator(BANNER)).not.toBeVisible();
  });

  // -------------------------------------------------------------------------
  // 6. Banner is visible across page navigation
  // -------------------------------------------------------------------------

  test("banner persists when navigating to another page while disconnected", async ({
    page,
  }) => {
    // Start in disconnected state (default).
    await expect(page.locator(BANNER)).toBeVisible();

    // Navigate to a different page using client-side routing so the Zustand
    // store state (isConnected = false) is preserved across the navigation.
    // page.goto() would reload the entire app and reset the store.
    await clickNavLink(page, /^search database/i, /\/search/);

    // Banner must still be visible on the new page.
    await expect(page.locator(BANNER)).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // 7. Banner is gone on a new page after connect
  // -------------------------------------------------------------------------

  test("banner stays hidden after connect when navigating to another page", async ({
    page,
  }) => {
    // Simulate connect while on Live Messages.
    await fireSocketEvent(page, "connect", null);
    await expect(page.locator(BANNER)).not.toBeVisible();

    // Navigate away using client-side routing so the Zustand store state
    // (isConnected = true) is preserved across the navigation.
    // page.goto() would reload the entire app and reset the store.
    await clickNavLink(page, /^search database/i, /\/search/);

    // Banner must remain hidden on the new page.
    await expect(page.locator(BANNER)).not.toBeVisible();
  });
});
