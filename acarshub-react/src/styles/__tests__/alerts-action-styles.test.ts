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
 * Source-level guards for the Alerts "Mark All Read" action's styles.
 *
 * The action's *rendered* behaviour — which placement is chosen, whether it
 * is visible, whether it matches the mode buttons' height — is covered by
 * e2e/alerts-action-placement.spec.ts, which is where anything requiring a
 * real layout engine belongs.
 *
 * What is left here are properties of the stylesheet itself that a browser
 * cannot report on, because the failure mode is a declaration silently doing
 * nothing rather than doing something wrong.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const stylesDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Reads a stylesheet with `//` comments stripped — see the note in
 * page-header-typography.test.ts for why. */
function read(relative: string): string {
  return readFileSync(resolve(stylesDir, relative), "utf-8").replace(
    /^\s*\/\/.*$/gm,
    "",
  );
}

const alerts = read("pages/_alerts.scss");

describe("Mark All Read button styles", () => {
  it("does not reference the nonexistent --font-size-base token", () => {
    // The rule previously declared `font-size: var(--font-size-base)`. That
    // token is not defined anywhere (the theme layer exposes --font-size-md),
    // so the declaration resolved to nothing and the button silently
    // inherited its size instead of taking the intended one.
    //
    // This is exactly the class of bug a browser cannot surface: no error, no
    // warning, and a rendered result that looks plausible.
    expect(alerts).not.toMatch(/var\(--font-size-base\)/);
  });

  it("sizes the controls-bar placement by stretching, not by restating metrics", () => {
    // The action must be exactly as tall as the mode buttons it sits beside.
    // That is achieved with align-self:stretch so the row height stays the
    // single source of truth.
    //
    // Re-deriving the height by copying the mode button's padding/font into
    // this rule would look equivalent and pass the E2E height check today,
    // while silently decoupling the two the next time either is adjusted.
    // Pin the mechanism, not just the outcome.
    const controlsBar = alerts.match(
      /&--controls-bar\s*\{([\s\S]*?)\n {4}\}/,
    )?.[1];

    expect(controlsBar, "&--controls-bar rule not found").toBeDefined();
    expect(controlsBar).toMatch(/align-self:\s*stretch;/);
  });
});
