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
// marker-size.spec.ts — FEAT-MARKER-SIZE regression suite
//
// Purpose
// -------
// The marker-size setting (Settings -> Map -> Aircraft Marker Size) scales
// aircraft marker rendering in two independent code paths (SVG-fallback and
// sprite-atlas) via `utils/markerSize.ts`'s scale multiplier. This suite
// verifies, in a real browser (not jsdom), that:
//
// 1. Changing the setting visibly resizes the rendered marker
//    (small < medium < large).
// 2. The clickable hit target (.aircraft-marker-hit) never drops below the
//    WCAG 2.1 AA 44px floor on mobile, even at the "small" setting — the
//    floor is a `min-width`/`min-height` in SCSS decoupled from the visual
//    icon size specifically so this holds regardless of scale.
//
// Unit tests (AircraftMarkers.test.tsx, AnimatedSprite.test.tsx,
// spriteLoader.test.ts, markerSize.test.ts) already cover the scale-math
// wiring in isolation; this suite is the end-to-end proof that the real
// cascade (SCSS custom properties, touch-target mixin, sprite atlas crop)
// composes correctly in an actual browser.
// ---------------------------------------------------------------------------

const MIN_TOUCH = 44;

interface MinimalADSBAircraft {
  hex: string;
  flight?: string;
  lat?: number;
  lon?: number;
  alt_baro?: number;
  gs?: number;
  track?: number;
}

// Positioned at the app's default map center (map.defaultCenterLat/Lon are
// both 0 — see useSettingsStore.ts's getDefaultSettings()) rather than a
// real-world airport, so the marker is guaranteed to be within the initial
// viewport bounds at any aspect ratio/zoom, including narrow mobile
// viewports where a fixed real-world coordinate (e.g. a US airport) can
// fall outside the visible map area depending on the default zoom level.
const AIRCRAFT: MinimalADSBAircraft = {
  hex: "a1b2c3",
  flight: "UAL123",
  lat: 0,
  lon: 0,
  alt_baro: 35000,
  gs: 450,
  track: 90,
};

async function injectAdsbData(page: Page): Promise<boolean> {
  return page.evaluate((aircraft) => {
    return new Promise<boolean>((resolve) => {
      const deadline = Date.now() + 5000;
      const tryInject = (): void => {
        // biome-ignore lint/suspicious/noExplicitAny: E2E window access
        const store = (window as any).__ACARS_STORE__;
        if (store) {
          store
            .getState()
            .setAdsbAircraft({ now: 1_700_000_000, aircraft: [aircraft] });
          resolve(true);
        } else if (Date.now() >= deadline) {
          resolve(false);
        } else {
          setTimeout(tryInject, 50);
        }
      };
      tryInject();
    });
  }, AIRCRAFT);
}

async function navigateToLiveMapWithAircraft(page: Page): Promise<void> {
  await page.goto("/adsb");
  await expect(page.locator("header.navigation")).toBeVisible();
  const injected = await injectAdsbData(page);
  expect(injected).toBe(true);
  // The marker only renders once the map reports its initial viewport
  // bounds (a moveend/load event from the WebGL map instance) — this can
  // take noticeably longer than the default 5s timeout under mobile device
  // emulation / throttled CPU, so give it a generous window here rather
  // than at every individual assertion call site.
  await expect(page.locator(".aircraft-marker-hit").first()).toBeVisible({
    timeout: 20_000,
  });
}

/** First rendered marker hit-target on the map. */
function markerHitTarget(page: Page) {
  return page.locator(".aircraft-marker-hit").first();
}

async function openSettings(page: Page): Promise<void> {
  const mobileMenu = page.locator("details.small_nav");
  if (await mobileMenu.isVisible()) {
    await page.locator("details.small_nav > summary").click();
  }
  await page.getByRole("button", { name: /settings/i }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

async function closeSettings(page: Page): Promise<void> {
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
}

async function setMarkerSize(
  page: Page,
  size: "small" | "medium" | "large",
): Promise<void> {
  await openSettings(page);
  await page.getByRole("tab", { name: /^map$/i }).click();
  // The <input type="radio"> itself is visually hidden by custom CSS
  // styling — the clickable area is the associated <label> text, matching
  // the settings-persistence.spec.ts pattern.
  const label = size.charAt(0).toUpperCase() + size.slice(1);
  await page.locator(`label[for="marker-size-${size}"]`).click();
  const input = page.locator(`#marker-size-${size}`);
  await expect(
    input,
    `${label} radio should be checked after click`,
  ).toBeChecked();
  await closeSettings(page);
}

test.describe("FEAT-MARKER-SIZE: marker visibly resizes with the setting", () => {
  // Firefox's headless WebGL implementation does not reliably render the
  // MapLibre canvas (and therefore never fires the moveend/load event that
  // populates viewportBounds and lets AircraftMarkers.tsx render any marker
  // at all) in this Docker/Playwright environment — verified via
  // screenshot: the aircraft appears correctly in the sidebar list (data
  // injection works) but the map area itself is blank on every run,
  // deterministically, not just this test. This is the same category of
  // known Firefox+headless-WebGL limitation already documented in
  // accessibility.spec.ts's focus-trap Firefox skip; unrelated to
  // FEAT-MARKER-SIZE itself (no marker of any kind renders on Firefox here,
  // not just a scaling difference). Must be a describe-level skip (not
  // inside the test body) since the failure otherwise happens in
  // beforeEach, before a test-body-level test.skip() would ever run.
  test.skip(
    ({ browserName }) => browserName === "firefox",
    "MapLibre WebGL canvas does not reliably render in headless Firefox in this environment, so no map marker (of any kind) appears to measure",
  );

  test.beforeEach(async ({ page }) => {
    await navigateToLiveMapWithAircraft(page);
  });

  test("small < medium < large, measured on the rendered marker", async ({
    page,
  }) => {
    // The inner visual element (sprite or SVG icon) always scales with the
    // setting, regardless of viewport, since — unlike the enclosing
    // .aircraft-marker-hit wrapper — it carries no touch-target floor.
    const visual = page
      .locator(
        ".aircraft-marker-hit .aircraft-sprite, .aircraft-marker-hit .aircraft-marker",
      )
      .first();

    async function widthAt(
      size: "small" | "medium" | "large",
    ): Promise<number> {
      await setMarkerSize(page, size);
      // expect.poll rather than a single boundingBox() read: the marker
      // re-render after a settings change is asynchronous (Zustand store
      // update -> React re-render -> SCSS custom property update), so a
      // single immediate read can race the re-render and observe the
      // previous size. Poll until the box stabilizes at its final width.
      let lastWidth = -1;
      await expect
        .poll(
          async () => {
            const box = await visual.boundingBox();
            const width = box?.width ?? -1;
            const stable = width === lastWidth;
            lastWidth = width;
            return stable;
          },
          { message: `${size} marker width to stabilize` },
        )
        .toBe(true);
      return lastWidth;
    }

    const small = await widthAt("small");
    const medium = await widthAt("medium");
    const large = await widthAt("large");

    expect(small, "small < medium").toBeLessThan(medium);
    expect(medium, "medium < large").toBeLessThan(large);
  });
});

test.describe("FEAT-MARKER-SIZE: 44px touch-target floor holds at every size", () => {
  test.skip(({ viewport }) => {
    const width = viewport?.width ?? 1280;
    return width > 768;
  }, "Touch-target floor is only guaranteed on mobile viewports (desktop intentionally has no floor, see _aircraft-markers.scss)");

  test.beforeEach(async ({ page }) => {
    await navigateToLiveMapWithAircraft(page);
  });

  for (const size of ["small", "medium", "large"] as const) {
    test(`marker hit target meets 44px floor at '${size}'`, async ({
      page,
    }) => {
      await setMarkerSize(page, size);

      // Wait for the box to stabilize before measuring — the marker
      // re-render after a settings change is asynchronous (see the
      // "small < medium < large" test above for the full rationale).
      let lastWidth = -1;
      await expect
        .poll(async () => {
          const box = await markerHitTarget(page).boundingBox();
          const width = box?.width ?? -1;
          const stable = width === lastWidth;
          lastWidth = width;
          return stable;
        })
        .toBe(true);

      const box = await markerHitTarget(page).boundingBox();
      expect(box).not.toBeNull();
      if (!box) return;

      expect
        .soft(box.width, `hit target width at ${size}`)
        .toBeGreaterThanOrEqual(MIN_TOUCH);
      expect
        .soft(box.height, `hit target height at ${size}`)
        .toBeGreaterThanOrEqual(MIN_TOUCH);
    });
  }
});
