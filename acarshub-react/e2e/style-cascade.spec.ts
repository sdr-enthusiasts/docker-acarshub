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
// style-cascade.spec.ts
//
// Purpose
// -------
// Regression suite for stylesheet rules that were silently losing the
// cascade: a later, more specific-looking rule was beaten by an earlier rule
// with higher specificity, so the intended style never rendered. Biome's
// lint/style/noDescendingSpecificity rule surfaced these; this suite proves
// the fixed rules actually win in a real browser.
//
// Why this needs to be E2E rather than a unit test
// ------------------------------------------------
// The failure mode is the cascade itself. jsdom does not implement selector
// specificity or :hover/:active, so only a real engine can tell which rule
// wins. Where the real component is easy to reach (the log viewer and the
// settings toggles live on Settings -> Advanced) the test uses it. Where the
// state is hard to reach through app data (an SVG-path aircraft marker with
// unread messages, a disabled MapLibre zoom button, a <pre><code> block in a
// card) the test renders the exact markup those components produce into the
// live page, so the app's real stylesheets are what's under test.
// ---------------------------------------------------------------------------

/** Resolves a CSS colour expression (e.g. `var(--color-red)`) to the
 * computed `rgb(...)` form the browser reports, so assertions don't depend
 * on hard-coded theme values. */
async function resolveColor(page: Page, cssColor: string): Promise<string> {
  return page.evaluate((value) => {
    const probe = document.createElement("div");
    probe.style.color = value;
    document.body.appendChild(probe);
    const resolved = getComputedStyle(probe).color;
    probe.remove();
    return resolved;
  }, cssColor);
}

/** Appends test-only markup in a fixed, top-most container so it can be
 * hovered without anything on the page intercepting the pointer. */
async function mountFixture(page: Page, html: string): Promise<void> {
  await page.evaluate((markup) => {
    const host = document.createElement("div");
    host.id = "style-cascade-fixture";
    host.style.position = "fixed";
    host.style.top = "120px";
    host.style.left = "120px";
    host.style.zIndex = "2147483647";
    host.innerHTML = markup;
    document.body.appendChild(host);
  }, html);
}

async function computed(
  page: Page,
  selector: string,
  property: string,
): Promise<string> {
  return page.evaluate(
    ([sel, prop]) => {
      const el = document.querySelector(sel);
      if (!el) return "<missing>";
      return getComputedStyle(el).getPropertyValue(prop);
    },
    [selector, property] as const,
  );
}

async function openAdvancedSettings(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator("header.navigation")).toBeVisible();
  const mobileMenu = page.locator("details.small_nav");
  if (await mobileMenu.isVisible()) {
    await page.locator("details.small_nav > summary").click();
  }
  await page.getByRole("button", { name: /settings/i }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("tab", { name: /^advanced$/i }).click();
  await expect(page.locator("#advanced-panel")).toBeVisible();
}

// ---------------------------------------------------------------------------
// Aircraft markers (SVG rendering path)
// ---------------------------------------------------------------------------

test.describe("aircraft marker hover and press styles", () => {
  test.skip(
    ({ isMobile }) => isMobile,
    "Pointer hover/press states do not apply to touch devices",
  );

  const MARKER_FIXTURE = `
    <button type="button" class="aircraft-marker-hit" id="plain-marker">
      <span class="aircraft-marker"><img alt="" src="data:image/gif;base64,R0lGODlhAQABAAAAACw="></span>
    </button>
    <button type="button" class="aircraft-marker-hit" id="unread-marker">
      <span class="aircraft-marker aircraft-marker--unread"><img alt="" src="data:image/gif;base64,R0lGODlhAQABAAAAACw="></span>
    </button>
  `;

  test.beforeEach(async ({ page }) => {
    // _aircraft-markers.scss is imported by AircraftMarkers.tsx and only
    // ships in the lazily-loaded Live Map chunk.
    await page.goto("/adsb");
    await expect(page.locator("header.navigation")).toBeVisible();
    await mountFixture(page, MARKER_FIXTURE);
    // Wait until the marker stylesheet is applied (the unread glow at rest
    // comes from it).
    await expect
      .poll(() => computed(page, "#unread-marker img", "filter"))
      .toContain("250, 179, 135");
  });

  test("hovering an unread marker intensifies its glow instead of replacing it", async ({
    page,
  }) => {
    // Regression: the generic hover shadow used a (0,4,1) selector that beat
    // the (0,2,1) unread hover rule, so hovering swapped the peach glow for a
    // plain black shadow.
    await page.locator("#unread-marker").hover();
    await expect
      .poll(() => computed(page, "#unread-marker img", "filter"))
      .toMatch(/250, 179, 135.*7px|7px.*250, 179, 135/);
  });

  test("hovering a plain marker shows the black shadow", async ({ page }) => {
    await page.locator("#plain-marker").hover();
    await expect
      .poll(() => computed(page, "#plain-marker img", "filter"))
      .toMatch(/rgba\(0, 0, 0, 0\.8\)/);
  });

  test("pressing a plain marker applies the active brightness", async ({
    page,
  }) => {
    // Regression: :active implies :hover, and the hover rule outranked the
    // active rule, so the press style never rendered.
    await page.locator("#plain-marker").hover();
    await page.mouse.down();
    try {
      await expect
        .poll(() => computed(page, "#plain-marker img", "filter"))
        .toContain("brightness(1.2)");
    } finally {
      await page.mouse.up();
    }
  });
});

// ---------------------------------------------------------------------------
// MapLibre zoom controls
// ---------------------------------------------------------------------------

test.describe("map zoom control icons", () => {
  test("a disabled zoom button's icon is dimmed in the light theme", async ({
    page,
  }) => {
    // Regression: the light-theme icon rule used a [data-theme] selector
    // that outranked the :disabled icon rule, so disabled zoom icons kept
    // opacity 0.8 instead of 0.3 in Latte.
    await page.goto("/adsb");
    await expect(page.locator("header.navigation")).toBeVisible();
    await page.evaluate(() => {
      document.documentElement.setAttribute("data-theme", "light");
    });
    await mountFixture(
      page,
      `<div class="map-container"><div class="maplibregl-ctrl-group">
         <button type="button" class="maplibregl-ctrl-zoom-in" disabled id="zoom-disabled">
           <span class="maplibregl-ctrl-icon"></span>
         </button>
         <button type="button" class="maplibregl-ctrl-zoom-out" id="zoom-enabled">
           <span class="maplibregl-ctrl-icon"></span>
         </button>
       </div></div>`,
    );

    await expect
      .poll(() =>
        computed(page, "#zoom-disabled .maplibregl-ctrl-icon", "opacity"),
      )
      .toBe("0.3");
    await expect
      .poll(() =>
        computed(page, "#zoom-enabled .maplibregl-ctrl-icon", "opacity"),
      )
      .toBe("0.8");
  });
});

// ---------------------------------------------------------------------------
// Card code styling
// ---------------------------------------------------------------------------

test.describe("card code styling", () => {
  test("code blocks inside <pre> do not get the light-theme inline-code border", async ({
    page,
  }) => {
    // Regression: `[data-theme="light"] .card__content code` (0,2,1)
    // outranked `.card__content pre code` (0,1,2), so code blocks picked up
    // the pill border meant for inline code.
    await page.goto("/");
    await expect(page.locator("header.navigation")).toBeVisible();
    await page.evaluate(() => {
      document.documentElement.setAttribute("data-theme", "light");
    });
    await mountFixture(
      page,
      `<div class="card__content">
         <p>Inline <code id="inline-code">code</code></p>
         <pre><code id="block-code">block</code></pre>
       </div>`,
    );

    await expect
      .poll(() => computed(page, "#inline-code", "border-top-width"))
      .toBe("1px");
    await expect
      .poll(() => computed(page, "#block-code", "border-top-style"))
      .toBe("none");
  });
});

// ---------------------------------------------------------------------------
// Settings -> Advanced: log viewer stats and toggles
// ---------------------------------------------------------------------------

test.describe("settings advanced tab styles", () => {
  test.beforeEach(async ({ page }) => {
    await openAdvancedSettings(page);
  });

  test("log viewer level counts are coloured per level", async ({ page }) => {
    // Regression: `.logs-viewer-stats span strong` (0,1,2) outranked the
    // per-level `.logs-viewer-stat--<level> strong` (0,1,1) rules, so every
    // count rendered in the plain text colour.
    const expected: Array<[string, string]> = [
      ["error", "var(--color-red)"],
      ["warn", "var(--color-yellow)"],
      ["info", "var(--color-blue)"],
      ["debug", "var(--color-green)"],
    ];
    for (const [level, token] of expected) {
      const want = await resolveColor(page, token);
      await expect
        .poll(
          () => computed(page, `.logs-viewer-stat--${level} strong`, "color"),
          { message: `${level} count colour` },
        )
        .toBe(want);
    }
  });

  test("a disabled toggle looks disabled even when switched on", async ({
    page,
  }) => {
    // Regression: the disabled styles used `.toggle-wrapper--disabled`
    // selectors that lost to the checked and hover rules, so a disabled
    // toggle that was on stayed fully blue with a white thumb.
    //
    // No toggle in the app is disabled today, so disable the real
    // "Persist Logs" toggle the same way <Toggle disabled> renders it.
    await page.evaluate(() => {
      const input = document.querySelector<HTMLInputElement>("#persist-logs");
      if (!input) throw new Error("persist-logs toggle not found");
      input.checked = true;
      input.disabled = true;
      input
        .closest(".toggle-wrapper")
        ?.classList.add("toggle-wrapper--disabled");
    });

    const track = "#persist-logs ~ .toggle-slider .toggle-slider__track";
    const thumb = "#persist-logs ~ .toggle-slider .toggle-slider__thumb";
    const surface0 = await resolveColor(page, "var(--color-surface0)");
    const overlay0 = await resolveColor(page, "var(--color-overlay0)");

    await expect
      .poll(() => computed(page, track, "background-color"))
      .toBe(surface0);
    await expect
      .poll(() => computed(page, thumb, "background-color"))
      .toBe(overlay0);
    // Still shows the "on" position.
    await expect
      .poll(() => computed(page, thumb, "transform"))
      .not.toBe("none");
  });
});
