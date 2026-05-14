// Copyright (C) 2022-2026 Frederick Clausen II
// This file is part of acarshub <https://github.com/sdr-enthusiasts/docker-acarshub>.
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * geojsonOverlays Config Tests
 *
 * Why this exists: like mapProviders, this module is a static
 * configuration table plus three small helper functions, and the
 * helpers feed strings (paths, ids) directly into the Leaflet
 * GeoJSON layer code. Bugs are silent — an overlay that doesn't
 * appear when toggled, or a popup that shows the wrong field, or a
 * cross-category id collision that makes the wrong overlay light up.
 * None of those throw.
 *
 * Worth pinning:
 *
 *  1. Data integrity:
 *     - Every overlay id is unique across the WHOLE table (not just
 *       within a category — `getOverlayById` does a global linear
 *       search, so a cross-category duplicate would silently
 *       short-circuit on the first hit).
 *     - Every overlay's `category` field matches the name of the
 *       category it lives in (drift between the two is a tell-tale
 *       refactor bug — the popup/legend uses `category` but the
 *       grouping UI uses the category name).
 *     - Every overlay defaults to enabled=false (the contract with
 *       useSettingsStore is "user opt-in only"; a regression that
 *       flips a default to true would silently turn on overlays
 *       for every existing user on next deploy).
 *     - Every overlay has a non-empty path (Vite's `?url` import
 *       returning empty would silently 404 — Leaflet swallows
 *       fetch failures).
 *     - Every overlay has a colour in 6-digit hex (`#rrggbb`)
 *       form (Leaflet accepts named colours but the doc-block at
 *       the top of the source says hex; pinning the convention).
 *     - Opacity is in [0, 1] (Leaflet clamps silently — a value
 *       of 7 instead of 0.7 looks identical to 1.0 and would mask
 *       the intended fade).
 *
 *  2. getOverlayById:
 *     - Parameterised over every published id so every entry is
 *       reachable.
 *     - Returns undefined for unknown id and empty-string id.
 *     - Does NOT match on substring (the linear find uses === so
 *       this is implicit, but pinning prevents a future refactor
 *       to startsWith/includes from going unnoticed).
 *
 *  3. getOverlaysByCategory:
 *     - Returns the exact `overlays` array for each category name.
 *     - Returns [] for an unknown category name (NOT undefined —
 *       callers iterate the result).
 *     - Case-sensitive ("united states" !== "United States").
 *
 *  4. getAllOverlayIds:
 *     - Returns every published id (parameterised).
 *     - Length equals total overlay count.
 *     - Order is category-major (Global first, then US, UK,
 *       Europe) — the LayerControl renders in this order.
 */

import { describe, expect, it } from "vitest";
import {
  GEOJSON_OVERLAYS,
  getAllOverlayIds,
  getOverlayById,
  getOverlaysByCategory,
} from "../geojsonOverlays";

/** Flat list of every overlay in the table, for parameterised tests. */
const ALL_OVERLAYS = GEOJSON_OVERLAYS.flatMap((category) => category.overlays);

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

describe("geojsonOverlays data integrity", () => {
  it("has unique overlay IDs across the WHOLE table (not just within a category)", () => {
    // getOverlayById does a global linear search; a cross-category
    // duplicate would silently short-circuit on the first hit and
    // make the second overlay unreachable via that helper.
    const ids = ALL_OVERLAYS.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every overlay's category field matches its container category name", () => {
    // Drift between an overlay's `category` field and its container's
    // `name` is a refactor bug — the popup/legend code uses
    // overlay.category but the grouping UI uses category.name.
    for (const category of GEOJSON_OVERLAYS) {
      for (const overlay of category.overlays) {
        expect(
          overlay.category,
          `${overlay.id} sits in ${category.name} but declares category=${overlay.category}`,
        ).toBe(category.name);
      }
    }
  });

  it("every overlay defaults to enabled=false (user-opt-in contract)", () => {
    // useSettingsStore relies on this: a deploy that flipped a
    // default to true would silently turn on overlays for every
    // existing user.
    for (const overlay of ALL_OVERLAYS) {
      expect(overlay.enabled, `${overlay.id}.enabled`).toBe(false);
    }
  });

  it("every overlay has a non-empty path (Vite ?url import resolved)", () => {
    // An empty path would silently 404 — Leaflet swallows fetch
    // failures and just doesn't render the layer.
    for (const overlay of ALL_OVERLAYS) {
      expect(overlay.path.length, `${overlay.id}.path`).toBeGreaterThan(0);
    }
  });

  it("every overlay's colour is a 6-digit hex string", () => {
    // The source-file doc-block declares hex. Pinning the
    // convention so a stray 'red' or 'rgb(...)' string gets
    // caught (Leaflet would accept it, but tooling that parses
    // the legend wouldn't).
    for (const overlay of ALL_OVERLAYS) {
      expect(overlay.color, `${overlay.id}.color`).toMatch(HEX_COLOR_RE);
    }
  });

  it("every overlay's opacity is in [0, 1]", () => {
    // Leaflet clamps silently — opacity:7 looks identical to 1.0
    // and would mask the intended fade.
    for (const overlay of ALL_OVERLAYS) {
      expect(
        overlay.opacity,
        `${overlay.id}.opacity`,
      ).toBeGreaterThanOrEqual(0);
      expect(overlay.opacity, `${overlay.id}.opacity`).toBeLessThanOrEqual(1);
    }
  });

  it("category names are unique (LayerControl groups by name)", () => {
    const names = GEOJSON_OVERLAYS.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("category order is Global, United States, United Kingdom, Europe", () => {
    // LayerControl renders in this order. A regression that
    // alphabetises or reverses the array would silently reorder
    // the UI groups.
    expect(GEOJSON_OVERLAYS.map((c) => c.name)).toEqual([
      "Global",
      "United States",
      "United Kingdom",
      "Europe",
    ]);
  });
});

describe("getOverlayById", () => {
  it("returns the matching overlay for every published id", () => {
    // Parameterised over every overlay so any new overlay added
    // without re-exporting via GEOJSON_OVERLAYS gets caught.
    for (const overlay of ALL_OVERLAYS) {
      expect(getOverlayById(overlay.id), `lookup of ${overlay.id}`).toBe(
        overlay,
      );
    }
  });

  it("returns undefined for an unknown id", () => {
    expect(getOverlayById("nope_definitely_not_an_overlay")).toBeUndefined();
  });

  it("returns undefined for an empty-string id", () => {
    // Defensive: empty-string matches no real id, so the linear
    // find returns undefined. A refactor to startsWith/includes
    // would silently return the first overlay.
    expect(getOverlayById("")).toBeUndefined();
  });

  it("is exact-match, NOT a substring/prefix match", () => {
    // Implicit from === but pinning against a future refactor.
    // 'vatsim_tracon_boundaries' exists; the truncated 'vatsim_'
    // and the suffix 'boundaries' must not match.
    expect(getOverlayById("vatsim_")).toBeUndefined();
    expect(getOverlayById("boundaries")).toBeUndefined();
  });
});

describe("getOverlaysByCategory", () => {
  it("returns the exact overlays array for every published category", () => {
    for (const category of GEOJSON_OVERLAYS) {
      expect(getOverlaysByCategory(category.name)).toBe(category.overlays);
    }
  });

  it("returns [] for an unknown category (NOT undefined)", () => {
    // Callers iterate the result; undefined would throw.
    expect(getOverlaysByCategory("Atlantis")).toEqual([]);
  });

  it("returns [] for an empty-string category", () => {
    expect(getOverlaysByCategory("")).toEqual([]);
  });

  it("is case-sensitive ('united states' !== 'United States')", () => {
    // Pinning so a future refactor to .toLowerCase() comparison
    // gets caught (the typed GeoJSONCategory union is exact-case).
    expect(getOverlaysByCategory("united states")).toEqual([]);
    expect(getOverlaysByCategory("UNITED STATES")).toEqual([]);
  });
});

describe("getAllOverlayIds", () => {
  it("returns every published id", () => {
    const ids = getAllOverlayIds();
    for (const overlay of ALL_OVERLAYS) {
      expect(ids, `expected ${overlay.id} in the flat list`).toContain(
        overlay.id,
      );
    }
  });

  it("returns one id per overlay (length matches total overlay count)", () => {
    expect(getAllOverlayIds()).toHaveLength(ALL_OVERLAYS.length);
  });

  it("returns ids in category-major order (matches GEOJSON_OVERLAYS order)", () => {
    // LayerControl renders the toggle list in this order. A
    // regression that sorts alphabetically would silently
    // shuffle the UI.
    expect(getAllOverlayIds()).toEqual(
      GEOJSON_OVERLAYS.flatMap((c) => c.overlays.map((o) => o.id)),
    );
  });

  it("returns a new array on each call (no shared mutable state)", () => {
    // flatMap allocates a fresh array each time; pinning so a
    // refactor that memoises into a module-level constant
    // doesn't silently introduce shared-mutable-state bugs.
    const a = getAllOverlayIds();
    const b = getAllOverlayIds();
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });
});
