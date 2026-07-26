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
// map-controls-layout.spec.ts
//
// Purpose
// -------
// Regression suite for a three-part layout bug discovered interactively at
// the .map-controls height breakpoint (790px, see _map-controls.scss and
// _map-overlays-menu.scss):
//
// 1. At viewport heights <= 790px, the individual overlay buttons
//    (.map-controls__overlay--tall) collapse into a single 44px
//    MapOverlaysMenu flyout button. Because .map-controls relied on the
//    default `align-items: stretch`, the whole column was stretched to
//    match that group's 44px width, and every OTHER group's narrower (32px
//    at desktop widths) buttons fell back to flex-start alignment --
//    visibly shifting every icon left/"inward" except the overlays group
//    itself. Fixed with `align-items: flex-end` on .map-controls so every
//    group sizes to its own content and stays flush against the right edge.
// 2. .map-overlays-menu__button was unconditionally 44x44 regardless of
//    viewport width, while .map-control-button (every other button in the
//    column) is 32x32 at desktop widths and only 44x44 at mobile widths.
//    This made the flyout button look oversized next to its siblings at
//    desktop widths. Fixed by giving it the same width-based breakpoint.
// 3. The dropdown's open direction went through two broken iterations
//    before landing on the adaptive fix actually shipped:
//      a. Originally opened *upward* unconditionally (`bottom: 0` +
//         `column-reverse`) even though the button sits near the TOP of
//         the control column -- the opposite of what the component's own
//         docstring said. With 4-5 overlay items this routinely pushed the
//         dropdown's top edge above the viewport.
//      b. Flipping to *downward* unconditionally fixed (a) but broke short
//         viewports (landscape phones, small windows) where there isn't
//         enough room below the button either -- the dropdown got cut off
//         at the bottom instead.
//      c. The actual fix: MapOverlaysMenu.tsx measures the real space
//         above and below the button on every open (useLayoutEffect,
//         before paint), opens in whichever direction has more room, and
//         clamps max-height to that measured space via the
//         --map-overlays-menu-max-height custom property -- so the
//         dropdown is always fully within the viewport (scrolling
//         internally if content still doesn't fit either direction),
//         regardless of viewport size or where the button happens to sit.
// 4. .map-controls had z-index: 100, lower than MapLibre's own
//    .maplibregl-ctrl-top-right (z-index: 300, see _map.scss -- set there
//    specifically so native controls render above aircraft markers).
//    .map-controls establishes its own stacking context (position:
//    absolute + z-index), so no descendant inside it -- no matter how high
//    ITS OWN z-index is set -- can ever escape and stack above a sibling
//    context with a higher z-index than its own containing context. When
//    the overlays dropdown opened upward and grew tall enough to reach
//    into the zoom controls' screen area, the zoom controls rendered IN
//    FRONT of the dropdown instead of behind it. Fixed by raising
//    .map-controls' own z-index to 310.
// ---------------------------------------------------------------------------

async function navigateToLiveMap(page: Page): Promise<void> {
  await page.goto("/adsb");
  await expect(page.locator("header.navigation")).toBeVisible();

  // .map-controls only renders once isMapLoaded is true (see
  // LiveMapPage.tsx), which is set either by MapLibre's onLoad event or a
  // 10-second fallback timer (covers browsers/environments where WebGL
  // init is slow or unavailable, e.g. headless Firefox in Docker). Match
  // the 12-second ceiling accessibility.spec.ts already uses for the same
  // wait, rather than the default 5-second assertion timeout.
  await expect(page.locator(".map-controls")).toBeVisible({ timeout: 12000 });
}

test.describe("Map controls layout (790px height breakpoint)", () => {
  // This suite is specifically about the desktop-width, short-height
  // interaction -- skip the mobile viewport projects where
  // .map-control-button is always 44px regardless of height, so the bug
  // (a width mismatch between button types) cannot manifest.
  test.skip(({ viewport }) => {
    const width = viewport?.width ?? 1280;
    return width <= 768;
  }, "This suite targets desktop-width viewports; the underlying bug is a 32px/44px button-width mismatch that only exists above the mobile breakpoint");

  // -------------------------------------------------------------------------
  // 1. Every individual .map-control-button stays flush against
  //    .map-controls' own right edge, regardless of which sibling group is
  //    currently widest (short-height flyout vs tall-height individual
  //    buttons).
  //
  //    NOTE: this must assert against .map-controls' own bounding box, NOT
  //    just compare the buttons to each other. .map-controls is absolutely
  //    positioned with only `right: 10px` set, so its own right edge is
  //    always pinned to (viewport width - 10px) regardless of its content
  //    width -- a fixed, uncorrupted reference point. Comparing buttons
  //    only to each other doesn't work: in the broken state every
  //    non-overlay group gets stretched to the same wider width and their
  //    buttons ALL fall back to flex-start alignment *together*, so they
  //    stay consistent with each other while being uniformly shifted left
  //    away from .map-controls' true right edge. A test that only checks
  //    "do the buttons agree with each other" cannot see that whole-column
  //    shift; it has to check "do the buttons agree with the container".
  // -------------------------------------------------------------------------

  test("control buttons stay flush with the control panel's right edge at short viewport heights (<=790px)", async ({
    page,
  }) => {
    const vp = page.viewportSize() ?? { width: 1280, height: 900 };
    await page.setViewportSize({ ...vp, height: 789 });

    await navigateToLiveMap(page);

    const controlsBox = await page.locator(".map-controls").boundingBox();
    expect(controlsBox).not.toBeNull();

    // .map-control-button is used by every group except the overlays
    // flyout (which renders .map-overlays-menu__button instead at short
    // heights) -- exactly the buttons that were shifting inward.
    const buttons = page.locator(".map-control-button:visible");
    const count = await buttons.count();
    expect(count).toBeGreaterThan(1);

    if (controlsBox) {
      const controlsRight = controlsBox.x + controlsBox.width;
      for (let i = 0; i < count; i++) {
        const box = await buttons.nth(i).boundingBox();
        expect(box).not.toBeNull();
        if (box) {
          const buttonRight = box.x + box.width;
          // Allow a few px for the group's own 2px border -- but the
          // pre-fix regression shifted buttons ~14px left, comfortably
          // outside this tolerance.
          expect(controlsRight - buttonRight).toBeLessThanOrEqual(4);
        }
      }
    }
  });

  test("control buttons stay flush with the control panel's right edge at tall viewport heights (>790px)", async ({
    page,
  }) => {
    const vp = page.viewportSize() ?? { width: 1280, height: 900 };
    await page.setViewportSize({ ...vp, height: 900 });

    await navigateToLiveMap(page);

    const controlsBox = await page.locator(".map-controls").boundingBox();
    expect(controlsBox).not.toBeNull();

    const buttons = page.locator(".map-control-button:visible");
    const count = await buttons.count();
    expect(count).toBeGreaterThan(1);

    if (controlsBox) {
      const controlsRight = controlsBox.x + controlsBox.width;
      for (let i = 0; i < count; i++) {
        const box = await buttons.nth(i).boundingBox();
        expect(box).not.toBeNull();
        if (box) {
          const buttonRight = box.x + box.width;
          expect(controlsRight - buttonRight).toBeLessThanOrEqual(4);
        }
      }
    }
  });

  // -------------------------------------------------------------------------
  // 2. The overlays flyout button matches the sizing of every other control
  //    button at desktop widths (32px), not the mobile-only 44px size.
  // -------------------------------------------------------------------------

  test("overlays flyout button matches sibling button width at desktop widths", async ({
    page,
  }) => {
    const vp = page.viewportSize() ?? { width: 1280, height: 900 };
    await page.setViewportSize({ ...vp, height: 789 }); // short height shows the flyout button

    await navigateToLiveMap(page);

    const flyoutButton = page.locator(".map-overlays-menu__button");
    await expect(flyoutButton).toBeVisible();
    const flyoutBox = await flyoutButton.boundingBox();
    expect(flyoutBox).not.toBeNull();

    const siblingButton = page.locator(".map-control-button:visible").first();
    await expect(siblingButton).toBeVisible();
    const siblingBox = await siblingButton.boundingBox();
    expect(siblingBox).not.toBeNull();

    if (flyoutBox && siblingBox) {
      expect(flyoutBox.width).toBeCloseTo(siblingBox.width, 0);
      expect(flyoutBox.height).toBeCloseTo(siblingBox.height, 0);
    }
  });

  // -------------------------------------------------------------------------
  // 3. The overlays dropdown always renders fully within the viewport,
  //    regardless of which direction it opens in.
  // -------------------------------------------------------------------------

  test("overlays dropdown opens below the button and stays within the viewport when there is room below", async ({
    page,
  }) => {
    const vp = page.viewportSize() ?? { width: 1280, height: 900 };
    // Plenty of room below the button at this height -- expect downward.
    await page.setViewportSize({ ...vp, height: 789 });

    await navigateToLiveMap(page);

    const flyoutButton = page.locator(".map-overlays-menu__button");
    await expect(flyoutButton).toBeVisible();
    const buttonBox = await flyoutButton.boundingBox();
    expect(buttonBox).not.toBeNull();

    await flyoutButton.click();

    const dropdown = page.locator(".map-overlays-menu__dropdown");
    await expect(dropdown).toBeVisible();
    await expect(dropdown).not.toHaveClass(/--upward/);
    const dropdownBox = await dropdown.boundingBox();
    expect(dropdownBox).not.toBeNull();

    if (buttonBox && dropdownBox) {
      // Opens downward: dropdown's top edge is at or below the button's
      // bottom edge (allowing the small configured gap), never above it.
      expect(dropdownBox.y).toBeGreaterThanOrEqual(
        buttonBox.y + buttonBox.height - 1,
      );
      // Never renders above the top, or below the bottom, of the viewport.
      expect(dropdownBox.y).toBeGreaterThanOrEqual(0);
      expect(dropdownBox.y + dropdownBox.height).toBeLessThanOrEqual(
        vp.height + 1,
      );
    }
  });

  test("overlays dropdown flips upward and stays within the viewport when there is no room below", async ({
    page,
  }) => {
    const vp = page.viewportSize() ?? { width: 1280, height: 900 };
    // Very short viewport: the button (fixed ~94px+ from the top of the map
    // container) has little to no room below it, forcing the adaptive
    // flip to upward.
    await page.setViewportSize({ ...vp, height: 400 });

    await navigateToLiveMap(page);

    const flyoutButton = page.locator(".map-overlays-menu__button");
    await expect(flyoutButton).toBeVisible();

    await flyoutButton.click();

    const dropdown = page.locator(".map-overlays-menu__dropdown");
    await expect(dropdown).toBeVisible();
    await expect(dropdown).toHaveClass(/--upward/);

    const dropdownBox = await dropdown.boundingBox();
    expect(dropdownBox).not.toBeNull();
    if (dropdownBox) {
      // Regardless of direction, the dropdown must be fully within the
      // viewport -- this is what the measured max-height clamp guarantees.
      expect(dropdownBox.y).toBeGreaterThanOrEqual(0);
      expect(dropdownBox.y + dropdownBox.height).toBeLessThanOrEqual(401);
    }
  });

  // -------------------------------------------------------------------------
  // 4. Dropdown items are compact at desktop widths (this flyout only
  //    appears at short *heights*, which is overwhelmingly a
  //    desktop/mouse scenario) but retain the full 44px touch target at
  //    mobile widths.
  // -------------------------------------------------------------------------

  test("dropdown items are compact (not 44px) at desktop widths", async ({
    page,
    viewport,
  }) => {
    test.skip(
      (viewport?.width ?? 1280) <= 768,
      "Desktop-only assertion; mobile widths intentionally keep the 44px touch target",
    );

    const vp = page.viewportSize() ?? { width: 1280, height: 900 };
    await page.setViewportSize({ ...vp, height: 789 });

    await navigateToLiveMap(page);
    await page.locator(".map-overlays-menu__button").click();

    const item = page.locator(".map-overlays-menu__item").first();
    await expect(item).toBeVisible();
    const box = await item.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.height).toBeLessThan(40);
    }
  });

  // -------------------------------------------------------------------------
  // 5. .map-controls (and therefore everything inside it, including the
  //    overlays dropdown) must stack above MapLibre's native top-right
  //    control container, so popouts that grow tall enough to spatially
  //    overlap the zoom controls render in front of them, not behind.
  // -------------------------------------------------------------------------

  test("map-controls stacks above MapLibre's native controls", async ({
    page,
  }) => {
    await navigateToLiveMap(page);

    const mapControlsZIndex = await page
      .locator(".map-controls")
      .evaluate((el) => Number.parseInt(getComputedStyle(el).zIndex, 10));
    const nativeControlsZIndex = await page
      .locator(".maplibregl-ctrl-top-right")
      .evaluate((el) => Number.parseInt(getComputedStyle(el).zIndex, 10));

    expect(Number.isNaN(mapControlsZIndex)).toBe(false);
    expect(Number.isNaN(nativeControlsZIndex)).toBe(false);
    // Strictly greater, not just >=: .map-controls establishes its own
    // stacking context, so its descendants (the overlays dropdown, the
    // provider-selector menu, the filters flyout) can only ever stack above
    // MapLibre's native controls if THIS element's own z-index beats theirs.
    expect(mapControlsZIndex).toBeGreaterThan(nativeControlsZIndex);
  });
});
