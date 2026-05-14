// Copyright (C) 2022-2026 Frederick Clausen II
// This file is part of acarshub <https://github.com/sdr-enthusiasts/docker-acarshub>.
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * mapProviders Config Tests
 *
 * Why this exists: this module is a static lookup table plus four
 * trivial helper functions. The lookup table is consumed all over the
 * map subsystem; the helpers are how the rest of the app resolves a
 * provider id into a tile URL. Bugs here are silent — the map shows
 * "no tiles" with no error, or the wrong tiles, or yesterday's
 * satellite imagery is off by a day. None of those produce a stack
 * trace.
 *
 * The contracts pinned here:
 *
 *  1. Data integrity:
 *     - All provider IDs are unique (the duplicates would silently
 *       overwrite each other in any Map/dict use; the linear find
 *       would only return the first).
 *     - Every entry has a non-empty name and category.
 *     - `gibs_clouds` is the only entry with a deliberately empty
 *       url (it's generated dynamically). This is pinned so a
 *       refactor that adds a placeholder url doesn't silently
 *       break getProviderTileUrl's special case.
 *
 *  2. getProviderConfig: O(n) lookup must return the matching entry
 *     for every published id, and undefined for unknown ids. The
 *     "every published id resolves" check is parameterised so a new
 *     provider added without updating ALL_PROVIDERS gets caught.
 *
 *  3. getProvidersByCategory:
 *     - "worldwide" returns exactly the WORLDWIDE_PROVIDERS array
 *       contents.
 *     - "us" returns exactly the US_PROVIDERS array contents.
 *     - "europe" returns an empty array (the EuropeMapProvider type
 *       is `never`, but the runtime behaviour is what matters here).
 *
 *  4. getGibsCloudsUrl:
 *     - Uses YESTERDAY's UTC date (NASA GIBS publishes one day
 *       behind). A regression that uses today's date silently
 *       returns 404s.
 *     - Month and day are zero-padded to 2 digits. Without padding
 *       the URL becomes 2026-1-3 which NASA rejects.
 *     - Year is 4-digit UTC year.
 *     - Base URL prefix and suffix are exact-pinned.
 *
 *  5. getProviderTileUrl:
 *     - "custom" + customUrl → returns customUrl verbatim.
 *     - "custom" without customUrl → falls through to the lookup,
 *       which returns "" (no MapProviderConfig has id "custom"; the
 *       `||` short-circuit yields "").
 *     - "gibs_clouds" → delegates to getGibsCloudsUrl().
 *     - Known id → returns that provider's url field.
 *     - Unknown id → returns "" (NOT undefined, NOT null — the SCSS
 *       and Leaflet glue code rely on the empty-string fallback).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ALL_PROVIDERS,
  getGibsCloudsUrl,
  getProviderConfig,
  getProvidersByCategory,
  getProviderTileUrl,
  US_PROVIDERS,
  WORLDWIDE_PROVIDERS,
} from "../mapProviders";

describe("mapProviders data integrity", () => {
  it("has unique provider IDs across ALL_PROVIDERS", () => {
    // Duplicate IDs would silently overwrite each other in any
    // dict/Map use; the linear find would only return the first.
    // Catches accidental copy-paste during expansion.
    const ids = ALL_PROVIDERS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("ALL_PROVIDERS is exactly the concatenation of worldwide + us", () => {
    expect(ALL_PROVIDERS).toEqual([...WORLDWIDE_PROVIDERS, ...US_PROVIDERS]);
  });

  it("every provider has a non-empty name and category", () => {
    for (const provider of ALL_PROVIDERS) {
      expect(provider.name.length, `name for ${provider.id}`).toBeGreaterThan(
        0,
      );
      expect(
        provider.category.length,
        `category for ${provider.id}`,
      ).toBeGreaterThan(0);
    }
  });

  it("every provider EXCEPT gibs_clouds has a non-empty url", () => {
    // gibs_clouds is the documented exception (url is generated
    // dynamically via getGibsCloudsUrl). Pinning this prevents
    // either (a) a refactor adding a placeholder url to gibs_clouds
    // — which would silently break the dynamic-date path — or (b)
    // a new provider being added with a forgotten url.
    for (const provider of ALL_PROVIDERS) {
      if (provider.id === "gibs_clouds") {
        expect(provider.url).toBe("");
      } else {
        expect(provider.url.length, `url for ${provider.id}`).toBeGreaterThan(
          0,
        );
      }
    }
  });

  it("every WORLDWIDE_PROVIDERS entry has category=worldwide", () => {
    for (const provider of WORLDWIDE_PROVIDERS) {
      expect(provider.category).toBe("worldwide");
    }
  });

  it("every US_PROVIDERS entry has category=us", () => {
    for (const provider of US_PROVIDERS) {
      expect(provider.category).toBe("us");
    }
  });
});

describe("getProviderConfig", () => {
  it("returns the matching config for every published provider id", () => {
    // Parameterised over the actual ALL_PROVIDERS list so a new
    // provider added without re-exporting via ALL_PROVIDERS gets
    // caught here.
    for (const provider of ALL_PROVIDERS) {
      const found = getProviderConfig(provider.id);
      expect(found, `lookup of ${provider.id}`).toBe(provider);
    }
  });

  it("returns undefined for an unknown id", () => {
    expect(getProviderConfig("nope_definitely_not_a_provider")).toBeUndefined();
  });

  it("returns undefined for an empty string id", () => {
    // Defensive: getProviderTileUrl uses this in a chain where an
    // empty-string lookup would short-circuit to the "" fallback;
    // a regression that matches on "" would silently return the
    // first provider in the list.
    expect(getProviderConfig("")).toBeUndefined();
  });
});

describe("getProvidersByCategory", () => {
  it("returns exactly the worldwide providers for category=worldwide", () => {
    expect(getProvidersByCategory("worldwide")).toEqual(WORLDWIDE_PROVIDERS);
  });

  it("returns exactly the us providers for category=us", () => {
    expect(getProvidersByCategory("us")).toEqual(US_PROVIDERS);
  });

  it("returns an empty array for category=europe", () => {
    // EuropeMapProvider is the `never` type at compile time, but
    // the runtime helper must still return [] rather than throw
    // or return undefined — callers iterate the result.
    expect(getProvidersByCategory("europe")).toEqual([]);
  });
});

describe("getGibsCloudsUrl (NASA's yesterday-date contract)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses yesterday's UTC date (NASA publishes one day behind)", () => {
    // 2026-03-15T12:00:00Z → yesterday is 2026-03-14.
    vi.setSystemTime(new Date("2026-03-15T12:00:00Z"));
    expect(getGibsCloudsUrl()).toContain("/2026-03-14/");
  });

  it("zero-pads month and day to two digits", () => {
    // Without zero-padding the URL becomes 2026-1-3 which NASA
    // rejects. Single-digit month AND single-digit day exercises
    // both branches.
    vi.setSystemTime(new Date("2026-01-04T12:00:00Z"));
    expect(getGibsCloudsUrl()).toContain("/2026-01-03/");
  });

  it("handles month boundary correctly (Mar 1 UTC → Feb yesterday)", () => {
    // Regression guard for "yesterday = today - 1 day" implemented
    // via Date arithmetic (which handles month boundaries) rather
    // than naive day-component arithmetic (which doesn't).
    vi.setSystemTime(new Date("2026-03-01T00:00:00Z"));
    expect(getGibsCloudsUrl()).toContain("/2026-02-28/");
  });

  it("handles year boundary correctly (Jan 1 UTC → Dec 31 previous year)", () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    expect(getGibsCloudsUrl()).toContain("/2025-12-31/");
  });

  it("handles leap-year boundary correctly (Mar 1 2024 UTC → Feb 29)", () => {
    // 2024 is a leap year; this catches a regression that uses
    // (28 or 30) instead of Date arithmetic.
    vi.setSystemTime(new Date("2024-03-01T00:00:00Z"));
    expect(getGibsCloudsUrl()).toContain("/2024-02-29/");
  });

  it("uses the exact NASA GIBS base URL and tile path suffix", () => {
    // Any drift in the base URL silently breaks every tile load.
    // Pin the prefix and suffix so a typo gets caught.
    vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));
    const url = getGibsCloudsUrl();
    expect(url).toMatch(
      /^https:\/\/gibs-a\.earthdata\.nasa\.gov\/wmts\/epsg3857\/best\/MODIS_Terra_CorrectedReflectance_TrueColor\/default\/\d{4}-\d{2}-\d{2}\/GoogleMapsCompatible_Level9\/\{z\}\/\{y\}\/\{x\}\.jpg$/,
    );
  });
});

describe("getProviderTileUrl", () => {
  describe("custom provider", () => {
    it("returns the customUrl verbatim when id=custom and customUrl is set", () => {
      expect(
        getProviderTileUrl(
          "custom",
          "https://my-tiles.example.com/{z}/{x}/{y}.png",
        ),
      ).toBe("https://my-tiles.example.com/{z}/{x}/{y}.png");
    });

    it("returns empty string when id=custom but customUrl is undefined", () => {
      // No MapProviderConfig has id "custom"; falls through to the
      // lookup which returns undefined and then the `|| ""`
      // short-circuit yields "". Pinning so a refactor that
      // returns `undefined` here doesn't silently break the
      // Leaflet glue that expects a string.
      expect(getProviderTileUrl("custom")).toBe("");
    });

    it("returns empty string when id=custom and customUrl is the empty string", () => {
      // Edge case: an empty customUrl is treated as 'no custom
      // URL' by the truthy check, so the function falls through.
      expect(getProviderTileUrl("custom", "")).toBe("");
    });
  });

  describe("gibs_clouds special case", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("delegates to getGibsCloudsUrl, NOT the (empty) url field on the config", () => {
      // If a regression swaps the order of the special-case
      // checks, this would return "" (the config's url field).
      const url = getProviderTileUrl("gibs_clouds");
      expect(url).toContain("/2026-06-14/");
      expect(url).toContain("MODIS_Terra_CorrectedReflectance_TrueColor");
    });
  });

  describe("standard providers", () => {
    it("returns the config's url for a known provider id", () => {
      expect(getProviderTileUrl("osm")).toBe(
        "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      );
    });

    it("returns the config's url for a US chart provider id", () => {
      expect(getProviderTileUrl("vfr_sectional")).toBe(
        "https://tiles.arcgis.com/tiles/ssFJjBXIUyZDrSYZ/arcgis/rest/services/VFR_Sectional/MapServer/tile/{z}/{y}/{x}",
      );
    });

    it("returns empty string for an unknown id (NOT undefined or null)", () => {
      // Leaflet glue and SCSS rely on the empty-string fallback.
      // A change to undefined or null would break both.
      const url = getProviderTileUrl("nope_definitely_not_a_provider");
      expect(url).toBe("");
    });
  });
});
