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
 * `.page__header` typography regression tests.
 *
 * The header is a single dense row holding a page title, a stat line, and
 * (on Alerts) the Mark All Read action. It previously styled the title on a
 * document-heading scale — 1.5rem rising to 1.875rem at >=768px — against
 * 1rem stats and a 0.875rem button, making the title roughly double the
 * height of everything beside it.
 *
 * These tests pin the corrected relationship. They are source-level rather
 * than rendered assertions because the property under test is the *declared
 * scale relationship* between sibling rules, which is far more legible in the
 * SCSS than reconstructed from computed styles in a browser.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const stylesDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Reads a stylesheet with `//` comments stripped.
 *
 * WHY: these tests assert on the absence of certain declarations, and the
 * SCSS documents the very patterns being banned ("this was
 * var(--font-size-base), which is wrong..."). Matching raw source would flag
 * the explanation as if it were the offence.
 */
function read(relative: string): string {
  return readFileSync(resolve(stylesDir, relative), "utf-8").replace(
    /^\s*\/\/.*$/gm,
    "",
  );
}

/** Extracts the body of a top-level rule (non-nested) by selector. */
function ruleBody(scss: string, selector: string): string {
  const match = scss.match(
    new RegExp(`\\n\\${selector}\\s*\\{([\\s\\S]*?)\\n\\}`),
  );
  if (!match) throw new Error(`Rule not found: ${selector}`);
  return match[1];
}

const common = read("pages/_common.scss");

describe(".page__title sizing", () => {
  const title = ruleBody(common, ".page__title");

  it("is 1rem so it matches the other content of the header row", () => {
    expect(title).toMatch(/font-size:\s*\$font-size-base;/);
  });

  it("does not use a heading-scale size", () => {
    // The exact regression: 2xl (1.5rem) / 3xl (1.875rem).
    expect(title).not.toMatch(/\$font-size-(?:2xl|3xl|4xl)/);
  });

  it("has no breakpoint step-up", () => {
    // The old rule grew the title at >=768px, which widened the mismatch on
    // exactly the screens with the most room. Size is now flat.
    expect(title).not.toMatch(/@include\s+breakpoint\(/);
  });

  it("keeps semibold weight to stay distinguishable from the stats", () => {
    // Size no longer separates the title from its neighbours, so weight and
    // colour are now doing that work alone.
    expect(title).toMatch(/font-weight:\s*\$font-weight-semibold;/);
    expect(title).toMatch(/color:\s*var\(--color-text\);/);
  });
});

describe(".page__subtitle sizing", () => {
  const subtitle = ruleBody(common, ".page__subtitle");

  it("stays one step below the title at every width", () => {
    expect(subtitle).toMatch(/font-size:\s*\$font-size-sm;/);
  });

  it("does not step up to the title's size at >=768px", () => {
    // It used to become $font-size-base at md, which now equals the title's
    // size and would flatten the title/subtitle relationship on About.
    expect(subtitle).not.toMatch(/@include\s+breakpoint\(/);
  });
});

describe("font-size token hygiene", () => {
  it("--font-size-base is not a defined CSS custom property", () => {
    // Pins the premise behind the rule below: the theme layer exposes
    // --font-size-md, and there is deliberately no --font-size-base. A
    // `var(--font-size-base)` therefore resolves to nothing and silently
    // falls back to inherited sizing rather than erroring.
    //
    // Should someone later define the token, this test fails and the
    // "never reference it" rules elsewhere can be retired rather than
    // lingering as cargo cult.
    expect(read("_themes.scss")).not.toMatch(/--font-size-base:/);
  });

  it("pages/_common.scss does not reference the nonexistent token", () => {
    expect(common).not.toMatch(/var\(--font-size-base\)/);
  });
});
