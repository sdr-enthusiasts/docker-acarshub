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
 * STYLE-INLINE-DYNAMIC regression tests.
 *
 * AGENTS.md forbids inline styles; the audit identified a number of
 * runtime-computed inline-style sites that could not simply move to a
 * static SCSS rule because their values depend on component state
 * (positions, dimensions, durations, rotations, etc.).
 *
 * The remediation pattern is:
 *
 *   1. JSX passes the runtime value through a CSS custom property:
 *      `style={{ "--name": value } as React.CSSProperties}`
 *   2. The SCSS rule consumes that custom property via `var(--name)`.
 *
 * This way only the *value* lives inline; the *property* (and any
 * static styling alongside it) lives in SCSS where the linter / theme
 * / overrides can reach it.
 *
 * One library-API exception is documented in-line: the `<Marker>`
 * component from `@vis.gl/react-maplibre` exposes only a `style` prop
 * (no `className`), so its `style={{ "--marker-z": ..., zIndex: ... }}`
 * stays as an inline style. The CSS variable is still set so that
 * descendant nodes can react to it.
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

describe("STYLE-INLINE-DYNAMIC: dynamic inline styles routed through CSS variables", () => {
  describe("LogsViewer.tsx — log display max-height", () => {
    const tsx = read("components/LogsViewer.tsx");
    const scss = read("styles/components/_logs-viewer.scss");

    it("no longer sets maxHeight as a literal inline style property", () => {
      expect(tsx).not.toMatch(/maxHeight:\s*`\$\{/);
    });

    it("passes the height through --logs-viewer-max-height", () => {
      expect(tsx).toMatch(/"--logs-viewer-max-height"\s*:/);
    });

    it("consumes the variable in .logs-viewer-display", () => {
      expect(scss).toMatch(
        /\.logs-viewer-display[\s\S]*?max-height:\s*var\(--logs-viewer-max-height/,
      );
    });
  });

  describe("Toast.tsx — progress-bar animation duration", () => {
    const tsx = read("components/Toast.tsx");
    const scss = read("styles/components/_toast.scss");

    it("no longer hard-codes `animationDuration:` inline", () => {
      expect(tsx).not.toMatch(/animationDuration:\s*`\$\{/);
    });

    it("passes duration through --toast-progress-duration", () => {
      expect(tsx).toMatch(/"--toast-progress-duration"\s*:/);
    });

    it("uses var(--toast-progress-duration) in the toast-progress animation", () => {
      expect(scss).toMatch(
        /animation:\s*toast-progress\s+var\(--toast-progress-duration\)/,
      );
    });
  });

  describe("ContextMenu.tsx — runtime cursor position", () => {
    const tsx = read("components/ContextMenu.tsx");
    const scss = read("styles/components/_context-menu.scss");

    it("no longer sets `left`/`top` as literal inline style properties", () => {
      expect(tsx).not.toMatch(/style=\{\{\s*\n?\s*left:\s*`\$\{/);
    });

    it("passes the coordinates through --ctx-menu-x and --ctx-menu-y", () => {
      expect(tsx).toMatch(/"--ctx-menu-x"\s*:/);
      expect(tsx).toMatch(/"--ctx-menu-y"\s*:/);
    });

    it("consumes the variables in .context-menu", () => {
      const block = scss.match(/\.context-menu\s*\{([\s\S]*?)\n\}/);
      expect(block).toBeTruthy();
      const body = block?.[1] ?? "";
      expect(body).toMatch(/left:\s*var\(--ctx-menu-x/);
      expect(body).toMatch(/top:\s*var\(--ctx-menu-y/);
    });
  });

  describe("GeoJSONOverlayButton.tsx — overlay swatch color", () => {
    const tsx = read("components/Map/GeoJSONOverlayButton.tsx");
    const scss = read("styles/components/_geojson-overlay-button.scss");

    it("no longer sets `backgroundColor` inline on the color swatch", () => {
      expect(tsx).not.toMatch(/style=\{\{\s*backgroundColor:/);
    });

    it("passes the color through --overlay-color", () => {
      expect(tsx).toMatch(/"--overlay-color"\s*:/);
    });

    it("consumes the variable on the color-swatch element", () => {
      expect(scss).toMatch(
        /&__color[\s\S]*?background-color:\s*var\(--overlay-color/,
      );
    });
  });

  describe("AnimatedSprite.tsx — sprite sheet position/rotation/cursor", () => {
    const tsx = read("components/Map/AnimatedSprite.tsx");
    const scss = read("styles/components/_aircraft-markers.scss");

    it("no longer sets backgroundPosition/transform inline", () => {
      expect(tsx).not.toMatch(/backgroundPosition:\s*`-?\$\{/);
      expect(tsx).not.toMatch(/transform:\s*`rotate\(/);
    });

    it("passes sprite metrics through --sprite-* CSS variables", () => {
      expect(tsx).toMatch(/"--sprite-x"\s*:/);
      expect(tsx).toMatch(/"--sprite-y"\s*:/);
      expect(tsx).toMatch(/"--sprite-bg-size"\s*:/);
      expect(tsx).toMatch(/"--sprite-width"\s*:/);
      expect(tsx).toMatch(/"--sprite-height"\s*:/);
      expect(tsx).toMatch(/"--sprite-rotation"\s*:/);
      expect(tsx).toMatch(/"--sprite-cursor"\s*:/);
    });

    it("defines .aircraft-sprite that consumes all sprite variables", () => {
      const rule = scss.match(/\.aircraft-sprite\s*\{([\s\S]*?)\n\}/);
      expect(rule).toBeTruthy();
      const body = rule?.[1] ?? "";
      expect(body).toMatch(
        /background-position:\s*var\(--sprite-x\)\s+var\(--sprite-y\)/,
      );
      expect(body).toMatch(/background-size:\s*var\(--sprite-bg-size/);
      expect(body).toMatch(/width:\s*var\(--sprite-width/);
      expect(body).toMatch(/height:\s*var\(--sprite-height/);
      expect(body).toMatch(/transform:\s*rotate\(var\(--sprite-rotation/);
      expect(body).toMatch(/cursor:\s*var\(--sprite-cursor/);
    });
  });

  describe("Virtualized list scaffolding — shared .virtual-list / .virtual-list__row", () => {
    const liveMessages = read("pages/LiveMessagesPage.tsx");
    const alerts = read("pages/AlertsPage.tsx");
    const search = read("pages/SearchPage.tsx");
    const virtualListScss = read("styles/components/_virtual-list.scss");
    const mainScss = read("styles/main.scss");

    it("registers the shared virtual-list partial in main.scss", () => {
      expect(mainScss).toMatch(/@use\s+["']components\/virtual-list["']/);
    });

    it("defines .virtual-list consuming --virtual-list-total-height", () => {
      expect(virtualListScss).toMatch(
        /\.virtual-list\s*\{[\s\S]*?height:\s*var\(--virtual-list-total-height/,
      );
    });

    it("defines .virtual-list__row consuming --virtual-row-y", () => {
      expect(virtualListScss).toMatch(
        /\.virtual-list__row\s*\{[\s\S]*?transform:\s*translateY\(var\(--virtual-row-y/,
      );
    });

    for (const [name, source] of [
      ["LiveMessagesPage", liveMessages],
      ["AlertsPage", alerts],
      ["SearchPage", search],
    ] as const) {
      it(`${name} no longer sets transform: translateY inline on virtualized rows`, () => {
        expect(source).not.toMatch(/transform:\s*`translateY\(\$\{/);
      });

      it(`${name} passes the row offset through --virtual-row-y`, () => {
        expect(source).toMatch(/"--virtual-row-y"\s*:/);
      });

      it(`${name} passes the total list height through --virtual-list-total-height`, () => {
        expect(source).toMatch(/"--virtual-list-total-height"\s*:/);
      });

      it(`${name} applies the shared virtual-list / virtual-list__row classes`, () => {
        expect(source).toMatch(/virtual-list\b/);
        expect(source).toMatch(/virtual-list__row\b/);
      });
    }
  });

  describe("AircraftMarkers.tsx — marker container, sprite, button, tooltip", () => {
    const tsx = read("components/Map/AircraftMarkers.tsx");
    const scss = read("styles/components/_aircraft-markers.scss");

    it("retains the <Marker style={{ ... }}> as a documented library exception", () => {
      // react-map-gl/maplibre's <Marker> exposes only a `style` prop (no
      // className) — see node_modules/@vis.gl/react-maplibre/dist/components/marker.d.ts.
      // The exception is annotated; verify the annotation is present.
      expect(tsx).toMatch(/library-API exception/i);
    });

    it("routes the marker z-index through --marker-z (not raw `position`/`zIndex`)", () => {
      expect(tsx).toMatch(/"--marker-z"\s*:/);
      // The previous inner-div literal `style={{ position: "relative", zIndex: ... }}`
      // is gone.
      expect(tsx).not.toMatch(
        /style=\{\{\s*\n?\s*position:\s*"relative",\s*\n?\s*zIndex:/,
      );
    });

    it("renders an .aircraft-marker__container wrapper", () => {
      expect(tsx).toMatch(/className="aircraft-marker__container"/);
      expect(scss).toMatch(
        /\.aircraft-marker__container\s*\{[\s\S]*?z-index:\s*var\(--marker-z/,
      );
    });

    it("no longer sets sprite backgroundPosition/transform inline on the sprite button", () => {
      // The legacy pattern used backticks for the value — by routing through
      // CSS variables we now use string-literal values (no backticks needed
      // around the static portion of e.g. `${rotation}deg`).
      expect(tsx).not.toMatch(
        /backgroundPosition:\s*`-\$\{markerData\.spritePosition/,
      );
    });

    it("passes the SVG-fallback marker dimensions through --marker-* variables", () => {
      expect(tsx).toMatch(/"--marker-width"\s*:/);
      expect(tsx).toMatch(/"--marker-height"\s*:/);
      expect(tsx).toMatch(/"--marker-rotation"\s*:/);
      expect(tsx).toMatch(/"--marker-cursor"\s*:/);
    });

    it("defines .aircraft-marker rule consuming the --marker-* variables", () => {
      const rule = scss.match(/\.aircraft-marker\s*\{([\s\S]*?)\n\}/);
      expect(rule).toBeTruthy();
      const body = rule?.[1] ?? "";
      expect(body).toMatch(/width:\s*var\(--marker-width/);
      expect(body).toMatch(/height:\s*var\(--marker-height/);
      expect(body).toMatch(/transform:\s*rotate\(var\(--marker-rotation/);
      expect(body).toMatch(/cursor:\s*var\(--marker-cursor/);
    });

    it("uses aircraft-tooltip--align-left/--align-right modifier classes instead of inline tooltip styles", () => {
      // Previously: style={{ left: ..., right: ..., transform: ... }}.
      // Now: modifier classes handle alignment per pre-existing SCSS rules.
      expect(tsx).toMatch(/aircraft-tooltip--align-left/);
      expect(tsx).toMatch(/aircraft-tooltip--align-right/);
      expect(tsx).not.toMatch(
        /style=\{\{\s*\n?\s*pointerEvents:\s*"none",\s*\n?\s*left:/,
      );
    });
  });
});
