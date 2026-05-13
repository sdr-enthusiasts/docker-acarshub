/* Copyright (C) 2022-2026 Frederick Clausen II
 * This file is part of acarshub <https://github.com/sdr-enthusiasts/docker-acarshub>.
 *
 * acarshub is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * acarshub is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with acarshub.  If not, see <http://www.gnu.org/licenses/>.
 */

/// <reference types="node" />

/**
 * STYLE-INLINE-STATIC regression tests.
 *
 * AGENTS.md forbids inline styles; the audit identified 8 static-value sites
 * across 5 files that violated this rule. Each site was extracted to a
 * dedicated SCSS class. These tests pin the fix by asserting:
 *
 * 1. The original `style={{ ... }}` patterns no longer appear in their
 *    source files (using narrow, anchored regexes so unrelated additions
 *    elsewhere in the same file don't trip the assertions).
 * 2. The new SCSS classes referenced in the JSX exist as actual rules in
 *    the corresponding stylesheet.
 *
 * Dynamic inline styles (values computed at runtime, e.g. from React state)
 * are intentionally out of scope here — they are addressed by
 * STYLE-INLINE-DYNAMIC.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(__dirname, "..", "..");

function read(relative: string): string {
  return readFileSync(resolve(srcDir, relative), "utf-8");
}

describe("STYLE-INLINE-STATIC: static inline styles moved to SCSS", () => {
  describe("StatusPage.tsx — errors-description paragraph", () => {
    const tsx = read("pages/StatusPage.tsx");
    const scss = read("styles/pages/_status.scss");

    it("no longer uses `style={{ marginBottom: ... }}`", () => {
      expect(tsx).not.toMatch(/style=\{\{\s*marginBottom:\s*"1rem"\s*\}\}/);
    });

    it("uses the .text-muted--spaced class", () => {
      expect(tsx).toMatch(/className="text-muted text-muted--spaced"/);
    });

    it("defines .text-muted--spaced in _status.scss", () => {
      expect(scss).toMatch(
        /\.text-muted--spaced\s*\{[^}]*margin-bottom:\s*1rem/,
      );
    });
  });

  describe("AboutPage.tsx — Safari image + update notice", () => {
    const tsx = read("pages/AboutPage.tsx");
    const scss = read("styles/pages/_about.scss");

    it("no longer uses inline `maxWidth`/`marginTop` on the Safari image", () => {
      expect(tsx).not.toMatch(/style=\{\{\s*maxWidth:\s*"100%"/);
    });

    it("no longer uses inline `color: var(--color-warning)` on the update notice", () => {
      expect(tsx).not.toMatch(/style=\{\{\s*color:\s*"var\(--color-warning\)"/);
    });

    it("uses .about-page__inline-figure on the Safari image", () => {
      expect(tsx).toMatch(/className="about-page__inline-figure"/);
    });

    it("uses .about-page__update-notice on the version-outdated paragraph", () => {
      expect(tsx).toMatch(/className="about-page__update-notice"/);
    });

    it("defines both classes in _about.scss", () => {
      expect(scss).toMatch(/&__inline-figure\s*\{/);
      expect(scss).toMatch(/&__update-notice\s*\{/);
    });
  });

  describe("SettingsModal.tsx — 3 inline-style sites", () => {
    const tsx = read("components/SettingsModal.tsx");
    const scss = read("styles/components/_settings-modal.scss");

    it("no longer uses any `style={{ width: ... }}` props", () => {
      expect(tsx).not.toMatch(/style=\{\{\s*width:\s*"100%"\s*\}\}/);
      expect(tsx).not.toMatch(/style=\{\{\s*width:\s*"120px"\s*\}\}/);
    });

    it("no longer uses inline `display: flex` row wrapper", () => {
      expect(tsx).not.toMatch(
        /style=\{\{\s*\n?\s*display:\s*"flex",\s*\n?\s*alignItems:/,
      );
    });

    it("uses the new modifier and layout classes", () => {
      expect(tsx).toMatch(/className="settings-input settings-input--full"/);
      expect(tsx).toMatch(
        /className="settings-input settings-input--fixed-narrow"/,
      );
      expect(tsx).toMatch(/className="settings-form-field__inline-row"/);
    });

    it("defines the new classes in _settings-modal.scss", () => {
      expect(scss).toMatch(/\.settings-input--full\s*\{[^}]*width:\s*100%/);
      expect(scss).toMatch(
        /\.settings-input--fixed-narrow\s*\{[^}]*width:\s*120px/,
      );
      expect(scss).toMatch(
        /\.settings-form-field__inline-row\s*\{[\s\S]*?display:\s*flex/,
      );
    });
  });

  describe("Map.tsx — MapLibreMap container", () => {
    const tsx = read("components/Map/Map.tsx");

    it("no longer passes redundant style={{ width: '100%', height: '100%' }} to <MapLibreMap>", () => {
      // The library itself defaults to width/height: 100% (see
      // node_modules/@vis.gl/react-maplibre/dist/components/map.js), so the
      // inline style was both redundant and a violation of the no-inline-style
      // rule. Removing it relies on the library default.
      expect(tsx).not.toMatch(
        /style=\{\{\s*width:\s*"100%",\s*height:\s*"100%"\s*\}\}/,
      );
    });
  });

  describe("AircraftMarkers.tsx — marker <img>", () => {
    const tsx = read("components/Map/AircraftMarkers.tsx");
    const scss = read("styles/components/_aircraft-markers.scss");

    it("no longer uses inline width/height/pointerEvents on the marker image", () => {
      // The specific pattern is unique to this site — pointerEvents in an
      // inline-style block.
      expect(tsx).not.toMatch(
        /style=\{\{\s*\n?\s*width:\s*"100%",\s*\n?\s*height:\s*"100%",\s*\n?\s*pointerEvents:\s*"none"/,
      );
    });

    it("retains width/height/pointer-events in .aircraft-marker img rule", () => {
      const aircraftMarkerImg = scss.match(
        /\.aircraft-marker\s*\{[\s\S]*?img\s*\{([\s\S]*?)\}/,
      );
      expect(aircraftMarkerImg).toBeTruthy();
      const body = aircraftMarkerImg?.[1] ?? "";
      expect(body).toMatch(/width:\s*100%/);
      expect(body).toMatch(/height:\s*100%/);
      expect(body).toMatch(/pointer-events:\s*none/);
    });
  });
});
