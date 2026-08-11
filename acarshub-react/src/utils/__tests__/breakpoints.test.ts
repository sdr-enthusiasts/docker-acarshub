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

// ---------------------------------------------------------------------------
// Guards the TS <-> SCSS breakpoint mirror.
//
// utils/breakpoints.ts duplicates two thresholds that are *defined* in SCSS.
// Duplication is unavoidable (JS cannot read a media query out of a stylesheet
// at runtime), so instead of trusting a comment, these tests parse the SCSS
// sources and assert the numbers still agree.
//
// A drift here is otherwise invisible: the Alerts "Mark All Read" action would
// be placed into a container that CSS has hidden, producing a button that is
// in the DOM, passes every render test, and cannot be seen or clicked.
// ---------------------------------------------------------------------------

/// <reference types="node" />

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  MOBILE_NAV_MAX_WIDTH_PX,
  MOBILE_NAV_QUERY,
  PAGE_HEADER_HIDDEN_MAX_HEIGHT_PX,
  PAGE_HEADER_HIDDEN_QUERY,
} from "../breakpoints";

// Resolve relative to this file rather than cwd, matching the convention in
// styles/__tests__/ and keeping the test independent of where vitest is run
// from.
const stylesDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../styles",
);

const read = (relativePath: string): string =>
  readFileSync(resolve(stylesDir, relativePath), "utf8");

describe("breakpoints TS/SCSS mirror", () => {
  it("PAGE_HEADER_HIDDEN_MAX_HEIGHT_PX matches the max-height that hides .page__header", () => {
    const scss = read("pages/_common.scss");

    // Find the `@media (max-height: Npx)` block that contains a
    // `.page__header { display: none }` rule.
    const match = scss.match(
      /@media\s*\(max-height:\s*(\d+)px\)\s*\{\s*\.page__header\s*\{\s*display:\s*none;/,
    );

    expect(
      match,
      "could not find the `@media (max-height: …) { .page__header { display: none } }` " +
        "rule in styles/pages/_common.scss. If the header is now hidden by a " +
        "different mechanism, update utils/breakpoints.ts and this test together.",
    ).not.toBeNull();

    expect(Number(match?.[1])).toBe(PAGE_HEADER_HIDDEN_MAX_HEIGHT_PX);
  });

  it("MOBILE_NAV_MAX_WIDTH_PX is exactly one below the SCSS md breakpoint", () => {
    const variables = read("_variables.scss");
    const match = variables.match(/\$breakpoint-md:\s*(\d+)px/);

    expect(
      match,
      "could not find `$breakpoint-md` in styles/_variables.scss",
    ).not.toBeNull();

    // The JS max-width query and the SCSS min-width mixin must partition the
    // width axis with no overlapping pixel (both layouts active) and no gap
    // (neither active).
    expect(MOBILE_NAV_MAX_WIDTH_PX).toBe(Number(match?.[1]) - 1);
  });

  it("exposes the thresholds as well-formed media query strings", () => {
    expect(PAGE_HEADER_HIDDEN_QUERY).toBe("(max-height: 800px)");
    expect(MOBILE_NAV_QUERY).toBe("(max-width: 767px)");
  });
});
