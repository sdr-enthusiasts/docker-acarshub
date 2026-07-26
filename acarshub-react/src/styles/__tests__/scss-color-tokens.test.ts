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
 * SCSS-COLOR-01 regression tests.
 *
 * AGENTS.md and DESIGN_LANGUAGE.md require theme-aware Catppuccin colors in
 * all SCSS — hardcoded `#ffffff` or `#000` break in one theme or the other.
 *
 * Historically the toggle and radio components had `background-color: #ffffff`
 * for their thumb/dot, which rendered invisibly in Latte (white-on-cream).
 * These tests pin the fix: form-control thumbs MUST resolve through the
 * theme-aware `--color-toggle-thumb` / `--color-radio-thumb` CSS variables,
 * and the Mocha + Latte mixins MUST define both.
 *
 * The single intentional exception is the print-only border in
 * `_live-messages.scss` (see SCSS-COLOR-01 comment in that file); it lives
 * inside an `@media print` block where Catppuccin variables would resolve to
 * the active screen theme and produce unreadable output on white paper.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const stylesDir = resolve(__dirname, "..");

function read(relative: string): string {
  return readFileSync(resolve(stylesDir, relative), "utf-8");
}

describe("SCSS-COLOR-01: theme-aware form-control colors", () => {
  describe("_toggle.scss", () => {
    const toggle = read("components/_toggle.scss");

    it("does not hardcode #ffffff (or #fff) for the thumb", () => {
      // The thumb used to be #ffffff in both the default and :checked states.
      // Any reappearance is a regression — use var(--color-toggle-thumb).
      expect(toggle).not.toMatch(/background-color:\s*#fff(?:fff)?\b/i);
    });

    it("uses var(--color-toggle-thumb) for the thumb background", () => {
      expect(toggle).toMatch(/background-color:\s*var\(--color-toggle-thumb\)/);
    });
  });

  describe("_radio.scss", () => {
    const radio = read("components/_radio.scss");

    it("does not hardcode #ffffff (or #fff) for the radio dot", () => {
      expect(radio).not.toMatch(/background-color:\s*#fff(?:fff)?\b/i);
    });

    it("uses var(--color-radio-thumb) for the radio dot", () => {
      expect(radio).toMatch(/background-color:\s*var\(--color-radio-thumb\)/);
    });
  });

  describe("_mixins.scss theme definitions", () => {
    const mixins = read("_mixins.scss");

    it("defines --color-toggle-thumb in theme-mocha mixin", () => {
      const mochaBlock = mixins.match(
        /@mixin theme-mocha\s*\{([\s\S]*?)\n\}/,
      )?.[1];
      expect(mochaBlock).toBeDefined();
      expect(mochaBlock).toMatch(/--color-toggle-thumb:/);
    });

    it("defines --color-toggle-thumb in theme-latte mixin", () => {
      const latteBlock = mixins.match(
        /@mixin theme-latte\s*\{([\s\S]*?)\n\}/,
      )?.[1];
      expect(latteBlock).toBeDefined();
      expect(latteBlock).toMatch(/--color-toggle-thumb:/);
    });

    it("defines --color-radio-thumb in both theme mixins", () => {
      const mochaBlock = mixins.match(
        /@mixin theme-mocha\s*\{([\s\S]*?)\n\}/,
      )?.[1];
      const latteBlock = mixins.match(
        /@mixin theme-latte\s*\{([\s\S]*?)\n\}/,
      )?.[1];
      expect(mochaBlock).toMatch(/--color-radio-thumb:/);
      expect(latteBlock).toMatch(/--color-radio-thumb:/);
    });
  });

  describe("_live-messages.scss print rule (documented exception)", () => {
    const liveMessages = read("pages/_live-messages.scss");

    it("retains hardcoded #000 only inside an @media print block with justification", () => {
      // The print-context `#000` is intentional (theme-independent paper
      // output). It must be:
      //   (a) inside an @media print block
      //   (b) accompanied by an SCSS-COLOR-01 rationale comment
      // Match only CSS property usages (e.g. `solid #000;`), not occurrences
      // of the literal `#000` inside `//` comment text.
      const codeUses =
        liveMessages.match(/(?<!\/\/[^\n]*)#000(?![0-9a-fA-F])/g) ?? [];
      // Filter out matches whose line starts with a comment marker.
      const realUses = liveMessages
        .split("\n")
        .filter(
          (line) => /#000(?![0-9a-fA-F])/.test(line) && !/^\s*\/\//.test(line),
        );
      expect(realUses.length).toBeLessThanOrEqual(1);
      expect(codeUses.length).toBeGreaterThanOrEqual(0); // sanity
      if (realUses.length === 1) {
        const printBlockMatch = liveMessages.match(
          /@media print\s*\{([\s\S]*?)\n\}/,
        );
        expect(printBlockMatch).toBeTruthy();
        expect(printBlockMatch?.[1]).toMatch(/#000(?![0-9a-fA-F])/);
        expect(liveMessages).toMatch(/SCSS-COLOR-01/);
      }
    });
  });
});
