import { expect, type Page, test } from "@playwright/test";

// ---------------------------------------------------------------------------
// page-header-consistency.spec.ts
//
// Purpose
// -------
// Pins the vertical chrome above each page's content to be consistent across
// the tool surfaces.
//
// The bug this guards against: `.page` used to carry a top margin
// ($spacing-sm / $spacing-lg) by default. Every app-like page overrode it back
// to 0 — Live Messages and Alerts explicitly, Stats via `margin: 0 auto auto
// auto`, Live Map via `margin: 0 !important` — except Search, which was simply
// never given the override. Search therefore rendered a 24px gap above its
// header that no other tool page had, inflating its apparent header area by
// roughly 45% (77px of chrome vs 57px elsewhere).
//
// The default is now 0 and About opts in, which is the inverse of the previous
// arrangement and matches what the majority of pages actually want.
//
// Why E2E: the defect is a *computed* margin on a shared base class
// interacting with per-page overrides across five stylesheets. Only a real
// cascade can tell you what a given page ends up with.
// ---------------------------------------------------------------------------

/**
 * Tool surfaces: pages that are monitored rather than read, and which
 * therefore sit flush against the nav bar to preserve vertical space.
 *
 * Live Map is excluded — it is full-viewport and renders no `.page__header`.
 */
const TOOL_PAGES = [
  { name: "Live Messages", path: "/live-messages" },
  { name: "Alerts", path: "/alerts" },
  { name: "Search Database", path: "/search" },
  { name: "Stats", path: "/status" },
] as const;

/**
 * Measures the gap between the bottom of the nav bar and the top of the
 * page header.
 *
 * Uses a full page load per route rather than client-side navigation: the
 * measurement must reflect the page's own styles from a cold start, and
 * SPA transitions can leave the previous route's `.page` element in the DOM
 * for a frame.
 */
async function gapAboveHeader(page: Page, path: string): Promise<number> {
  await page.goto(path, { waitUntil: "load" });
  await page.locator(".page__header").first().waitFor({ state: "visible" });

  return page.evaluate(() => {
    const app = document.querySelector(".app-content");
    const header = document.querySelector(".page__header");
    if (!app || !header) throw new Error("missing .app-content/.page__header");
    return Math.round(
      header.getBoundingClientRect().top - app.getBoundingClientRect().top,
    );
  });
}

test.describe("page header vertical chrome", () => {
  test.describe("tool pages sit flush against the nav bar", () => {
    for (const { name, path } of TOOL_PAGES) {
      test(`${name} has no gap above its header`, async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 900 });
        expect(await gapAboveHeader(page, path)).toBe(0);
      });

      test(`${name} has no gap above its header on mobile`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: 390, height: 900 });
        expect(await gapAboveHeader(page, path)).toBe(0);
      });
    }
  });

  test("every tool page has the same gap above its header", async ({
    page,
  }) => {
    // The absolute value is asserted above; this pins them equal to each
    // other, which is the property a user actually perceives when moving
    // between pages. Written as a set comparison so a future change that
    // moves all of them together stays green while one drifting fails.
    await page.setViewportSize({ width: 1280, height: 900 });

    const gaps = new Map<string, number>();
    for (const { name, path } of TOOL_PAGES) {
      gaps.set(name, await gapAboveHeader(page, path));
    }

    expect(
      new Set(gaps.values()).size,
      `gaps differ: ${JSON.stringify(Object.fromEntries(gaps))}`,
    ).toBe(1);
  });

  test("About keeps its deliberate detachment from the nav bar", async ({
    page,
  }) => {
    // About is a document rather than a tool surface and opts in to a gap.
    // Asserted so the opt-in is not silently lost in a future cleanup of the
    // `.page` margin rules.
    await page.setViewportSize({ width: 1280, height: 900 });
    expect(await gapAboveHeader(page, "/about")).toBeGreaterThan(0);
  });
});
