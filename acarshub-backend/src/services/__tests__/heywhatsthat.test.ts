// Copyright (C) 2022-2026 Frederick Clausen II
// This file is part of acarshub <https://github.com/sdr-enthusiasts/docker-acarshub>.
//
// acarshub is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// acarshub is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with acarshub.  If not, see <http://www.gnu.org/licenses/>.

/**
 * Unit tests for the HeyWhatsThat service.
 *
 * Tests cover:
 * - computeConfigHash: determinism, uniqueness, format
 * - convertToGeoJSON: coordinate swap, ring closure, properties, structure
 * - initHeyWhatsThat: no-op when token absent
 * - initHeyWhatsThat: cache-hit path (no network request)
 * - initHeyWhatsThat: cache-miss path (fetches, writes, sets URL)
 * - initHeyWhatsThat: cache invalidation when config hash changes
 * - initHeyWhatsThat: graceful degradation on API / network errors
 * - getHeyWhatsThatUrl: reflects service state after init
 * - readSavedGeoJSON: returns content when present, null when absent
 *
 * Regression tests:
 * - regression: does not overwrite valid cache when re-fetch fails
 * - regression: does not set URL when API returns empty rings array
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  computeConfigHash,
  convertToGeoJSON,
  feetAltListToMeters,
  getHeyWhatsThatUrl,
  initHeyWhatsThat,
  readSavedGeoJSON,
} from "../heywhatsthat.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal, well-formed HWT API response with the requested altitudes.
 *
 * @param altitudesFeet - altitudes in **feet** (matching the user-configured
 *   `HEYWHATSTHAT_ALTS` value).  The helper converts each value to meters
 *   before placing it in the `alt` field, mirroring how the real HWT API
 *   responds: the `alt` value echoes back the meters value that was passed in
 *   the `alts` query parameter.
 *
 * Each ring has 4 non-closed corner points using [lat, lon] ordering (as the
 * real HWT API returns).
 */
function makeApiResponse(altitudesFeet: number[] = [10000, 30000]) {
  return {
    id: "TESTTOKEN",
    lat: 35.1882827,
    lon: -106.5691108,
    elev_amsl: 1632.24,
    refraction: "0.25",
    rings: altitudesFeet.map((altFt) => ({
      // The HWT API returns meters — convert feet → meters to match real API behaviour
      alt: String(Math.round(altFt * 0.3048)),
      // 4-point square in [lat, lon] form — intentionally NOT closed
      points: [
        [35.0, -107.0],
        [36.0, -107.0],
        [36.0, -106.0],
        [35.0, -106.0],
      ] as [number, number][],
    })),
  };
}

/**
 * Reset the module-level `cachedUrl` between tests by calling initHeyWhatsThat
 * with an empty token, which is always a no-op that sets cachedUrl to undefined.
 */
async function resetCachedUrl(): Promise<void> {
  await initHeyWhatsThat("", "10000,30000", "/tmp/hwt-reset-unused.geojson");
}

// ---------------------------------------------------------------------------
// computeConfigHash
// ---------------------------------------------------------------------------

describe("computeConfigHash", () => {
  it("returns a 16-character hex string", () => {
    const h = computeConfigHash("TOKEN", "10000,30000");
    expect(h).toMatch(/^[0-9a-f]{16}$/);
  });

  it("is deterministic for the same inputs", () => {
    const h1 = computeConfigHash("ABC", "10000,30000");
    const h2 = computeConfigHash("ABC", "10000,30000");
    expect(h1).toBe(h2);
  });

  it("differs when the token changes", () => {
    const h1 = computeConfigHash("TOKEN_A", "10000,30000");
    const h2 = computeConfigHash("TOKEN_B", "10000,30000");
    expect(h1).not.toBe(h2);
  });

  it("differs when the alts change", () => {
    const h1 = computeConfigHash("TOKEN", "10000,30000");
    const h2 = computeConfigHash("TOKEN", "5000,15000");
    expect(h1).not.toBe(h2);
  });

  it("differs when both token and alts change", () => {
    const h1 = computeConfigHash("X", "10000");
    const h2 = computeConfigHash("Y", "20000");
    expect(h1).not.toBe(h2);
  });

  it("treats empty string token and alts as a valid (distinct) key", () => {
    const h1 = computeConfigHash("", "");
    const h2 = computeConfigHash("TOKEN", "");
    expect(h1).not.toBe(h2);
  });
});

// ---------------------------------------------------------------------------
// convertToGeoJSON
// ---------------------------------------------------------------------------

describe("convertToGeoJSON", () => {
  it("produces a FeatureCollection", () => {
    const result = convertToGeoJSON(makeApiResponse([10000]));
    expect(result.type).toBe("FeatureCollection");
    expect(Array.isArray(result.features)).toBe(true);
  });

  it("creates one Feature per ring", () => {
    const result = convertToGeoJSON(makeApiResponse([10000, 30000]));
    expect(result.features).toHaveLength(2);
  });

  it("each Feature has type 'Feature'", () => {
    const result = convertToGeoJSON(makeApiResponse([10000]));
    expect(result.features[0].type).toBe("Feature");
  });

  it("each Feature has Polygon geometry", () => {
    const result = convertToGeoJSON(makeApiResponse([10000]));
    expect(result.features[0].geometry.type).toBe("Polygon");
  });

  it("swaps [lat, lon] → [lon, lat] for GeoJSON compliance", () => {
    // Input: first point is [lat=35.0, lon=-107.0]
    // GeoJSON requires [lon=-107.0, lat=35.0]
    const result = convertToGeoJSON(makeApiResponse([10000]));
    const firstCoord = result.features[0].geometry.coordinates[0][0];
    expect(firstCoord[0]).toBeCloseTo(-107.0); // longitude
    expect(firstCoord[1]).toBeCloseTo(35.0); // latitude
  });

  it("closes the ring when the first and last input points differ", () => {
    // makeApiResponse intentionally does NOT close the ring
    const result = convertToGeoJSON(makeApiResponse([10000]));
    const ring = result.features[0].geometry.coordinates[0];
    const first = ring[0];
    const last = ring[ring.length - 1];
    expect(first[0]).toBe(last[0]);
    expect(first[1]).toBe(last[1]);
  });

  it("does not duplicate the closing point when the ring is already closed", () => {
    const response = makeApiResponse([10000]);
    // Manually close the ring in the input
    const fp = response.rings[0].points[0];
    response.rings[0].points.push([fp[0], fp[1]]);

    const result = convertToGeoJSON(response);
    const ring = result.features[0].geometry.coordinates[0];

    // The ring must still be closed exactly once — verify no extra duplicate
    expect(ring[0][0]).toBe(ring[ring.length - 1][0]);
    expect(ring[0][1]).toBe(ring[ring.length - 1][1]);
    // And the second-to-last should not equal the last (no double close)
    expect(ring[ring.length - 2][0]).not.toBe(ring[ring.length - 1][0]);
  });

  it("sets altitude property on each feature", () => {
    const result = convertToGeoJSON(makeApiResponse([10000, 30000]));
    expect(result.features[0].properties.altitude).toBe(10000);
    expect(result.features[1].properties.altitude).toBe(30000);
  });

  it("sets a human-readable altitude_label", () => {
    const result = convertToGeoJSON(makeApiResponse([10000]));
    // Locale formatting may use comma or period as thousands separator
    expect(result.features[0].properties.altitude_label).toMatch(/10.000 ft/);
  });

  it("sets ring_index matching the position in the rings array", () => {
    const result = convertToGeoJSON(makeApiResponse([10000, 30000, 50000]));
    expect(result.features[0].properties.ring_index).toBe(0);
    expect(result.features[1].properties.ring_index).toBe(1);
    expect(result.features[2].properties.ring_index).toBe(2);
  });

  it("throws when a ring has fewer than 3 points", () => {
    const response = makeApiResponse([10000]);
    response.rings[0].points = [
      [35.0, -107.0],
      [36.0, -107.0],
    ];
    expect(() => convertToGeoJSON(response)).toThrow(/too few points/);
  });

  it("handles a single altitude ring correctly", () => {
    const result = convertToGeoJSON(makeApiResponse([20000]));
    expect(result.features).toHaveLength(1);
    expect(result.features[0].properties.altitude).toBe(20000);
  });
});

// ---------------------------------------------------------------------------
// feetAltListToMeters
// ---------------------------------------------------------------------------

describe("feetAltListToMeters", () => {
  it("converts a single altitude from feet to meters", () => {
    expect(feetAltListToMeters("10000")).toBe("3048");
  });

  it("converts multiple altitudes from feet to meters", () => {
    expect(feetAltListToMeters("10000,30000")).toBe("3048,9144");
  });

  it("converts the default altitude list correctly", () => {
    // Default HEYWHATSTHAT_ALTS="10000,30000"
    // 10000 ft * 0.3048 = 3048 m, 30000 ft * 0.3048 = 9144 m
    expect(feetAltListToMeters("10000,30000")).toBe("3048,9144");
  });

  it("handles three altitudes", () => {
    expect(feetAltListToMeters("10000,20000,30000")).toBe("3048,6096,9144");
  });

  it("trims whitespace around each altitude", () => {
    expect(feetAltListToMeters("10000, 30000")).toBe("3048,9144");
  });

  it("regression: does not pass feet directly to API (10000 ft → 3048 m, not 10000 m)", () => {
    // 10000 m ≈ 32,808 ft — sending feet directly would request far-too-high coverage rings.
    // This test guards against regressing to the broken behaviour.
    const result = feetAltListToMeters("10000");
    expect(result).toBe("3048");
    expect(result).not.toBe("10000");
  });
});

// ---------------------------------------------------------------------------
// initHeyWhatsThat + getHeyWhatsThatUrl
// ---------------------------------------------------------------------------

describe("initHeyWhatsThat", () => {
  let tmpDir: string;
  let savePath: string;

  beforeEach(() => {
    tmpDir = join(
      tmpdir(),
      `hwt-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(tmpDir, { recursive: true });
    savePath = join(tmpDir, "heywhatsthat.geojson");
  });

  afterEach(async () => {
    await resetCachedUrl();
    vi.restoreAllMocks();
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // ---- no-op when token is absent -------------------------------------------

  describe("when token is empty", () => {
    it("does not set a URL", async () => {
      await initHeyWhatsThat("", "10000,30000", savePath);
      expect(getHeyWhatsThatUrl()).toBeUndefined();
    });

    it("does not create any files", async () => {
      await initHeyWhatsThat("", "10000,30000", savePath);
      expect(existsSync(savePath)).toBe(false);
    });

    it("does not call fetch", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      await initHeyWhatsThat("", "10000,30000", savePath);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  // ---- cache hit -------------------------------------------------------------

  describe("cache hit (valid cached file with matching hash)", () => {
    it("does not call fetch when cache is valid", async () => {
      const token = "CACHETOKEN";
      const alts = "10000,30000";
      const configHash = computeConfigHash(token, alts);

      // Pre-populate the cache
      const geoJSON = convertToGeoJSON(makeApiResponse([10000, 30000]));
      writeFileSync(savePath, JSON.stringify(geoJSON), "utf-8");
      writeFileSync(
        `${savePath}.meta.json`,
        JSON.stringify({ configHash, fetchedAt: Date.now(), token, alts }),
        "utf-8",
      );

      const fetchSpy = vi.spyOn(globalThis, "fetch");
      await initHeyWhatsThat(token, alts, savePath);

      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("sets the URL from the cached config hash", async () => {
      const token = "CACHETOKEN";
      const alts = "10000,30000";
      const configHash = computeConfigHash(token, alts);

      writeFileSync(
        savePath,
        JSON.stringify(convertToGeoJSON(makeApiResponse([10000, 30000]))),
        "utf-8",
      );
      writeFileSync(
        `${savePath}.meta.json`,
        JSON.stringify({ configHash, fetchedAt: Date.now(), token, alts }),
        "utf-8",
      );

      await initHeyWhatsThat(token, alts, savePath);

      expect(getHeyWhatsThatUrl()).toBe(
        `/data/heywhatsthat.geojson?v=${configHash}`,
      );
    });
  });

  // ---- cache miss (file absent) ---------------------------------------------

  describe("cache miss (no cached file)", () => {
    it("calls fetch exactly once", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => makeApiResponse([10000, 30000]),
      } as Response);

      await initHeyWhatsThat("FETCHTOKEN", "10000,30000", savePath);

      expect(fetchSpy).toHaveBeenCalledOnce();
    });

    it("saves a valid GeoJSON file to disk", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => makeApiResponse([10000, 30000]),
      } as Response);

      await initHeyWhatsThat("FETCHTOKEN", "10000,30000", savePath);

      expect(existsSync(savePath)).toBe(true);
      const saved = JSON.parse(readFileSync(savePath, "utf-8"));
      expect(saved.type).toBe("FeatureCollection");
      expect(saved.features).toHaveLength(2);
    });

    it("saves a sidecar metadata file with correct fields", async () => {
      const token = "FETCHTOKEN";
      const alts = "10000,30000";

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => makeApiResponse([10000, 30000]),
      } as Response);

      await initHeyWhatsThat(token, alts, savePath);

      const metaPath = `${savePath}.meta.json`;
      expect(existsSync(metaPath)).toBe(true);

      const meta = JSON.parse(readFileSync(metaPath, "utf-8"));
      expect(meta.token).toBe(token);
      expect(meta.alts).toBe(alts);
      expect(meta.configHash).toBe(computeConfigHash(token, alts));
      expect(typeof meta.fetchedAt).toBe("number");
    });

    it("sets the URL with the correct ?v= hash after a successful fetch", async () => {
      const token = "FETCHTOKEN";
      const alts = "10000,30000";

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => makeApiResponse([10000, 30000]),
      } as Response);

      await initHeyWhatsThat(token, alts, savePath);

      const expectedHash = computeConfigHash(token, alts);
      expect(getHeyWhatsThatUrl()).toBe(
        `/data/heywhatsthat.geojson?v=${expectedHash}`,
      );
    });

    it("includes the token in the fetch URL", async () => {
      const token = "NN6R7EXG";

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => makeApiResponse([10000]),
      } as Response);

      await initHeyWhatsThat(token, "10000", savePath);

      const calledUrl = fetchSpy.mock.calls[0][0] as string;
      expect(calledUrl).toContain(encodeURIComponent(token));
    });

    it("includes the alts in the fetch URL converted to meters", async () => {
      // User configures feet; the API must receive meters.
      // 10000 ft = 3048 m, 20000 ft = 6096 m, 30000 ft = 9144 m
      const alts = "10000,20000,30000";

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => makeApiResponse([10000, 20000, 30000]),
      } as Response);

      await initHeyWhatsThat("TOKEN", alts, savePath);

      const calledUrl = fetchSpy.mock.calls[0][0] as string;
      // Verify meters appear in the URL — not the raw feet values
      expect(calledUrl).toContain("alts=");
      expect(calledUrl).toContain(encodeURIComponent("3048,6096,9144"));
      // Regression: feet must NOT be passed directly
      expect(calledUrl).not.toContain(encodeURIComponent("10000,20000,30000"));
    });

    it("regression: API URL contains meters not feet for default alts", async () => {
      // Default HEYWHATSTHAT_ALTS="10000,30000" must be sent as "3048,9144"
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => makeApiResponse([10000, 30000]),
      } as Response);

      await initHeyWhatsThat("TOKEN", "10000,30000", savePath);

      const calledUrl = fetchSpy.mock.calls[0][0] as string;
      expect(calledUrl).toContain(encodeURIComponent("3048,9144"));
      expect(calledUrl).not.toContain(encodeURIComponent("10000,30000"));
    });
  });

  // ---- cache invalidation ---------------------------------------------------

  describe("cache invalidation (config hash changed)", () => {
    it("re-fetches when the token has changed since the cached file was written", async () => {
      const newToken = "NEWTOKEN";
      const alts = "10000,30000";
      const staleHash = computeConfigHash("OLDTOKEN", alts);

      // Write a stale cache
      writeFileSync(
        savePath,
        JSON.stringify(convertToGeoJSON(makeApiResponse([10000, 30000]))),
        "utf-8",
      );
      writeFileSync(
        `${savePath}.meta.json`,
        JSON.stringify({
          configHash: staleHash,
          fetchedAt: Date.now(),
          token: "OLDTOKEN",
          alts,
        }),
        "utf-8",
      );

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => makeApiResponse([10000, 30000]),
      } as Response);

      await initHeyWhatsThat(newToken, alts, savePath);

      expect(fetchSpy).toHaveBeenCalledOnce();
    });

    it("updates the metadata sidecar to reflect the new config after re-fetch", async () => {
      const newToken = "NEWTOKEN";
      const alts = "10000,30000";

      writeFileSync(
        savePath,
        JSON.stringify(convertToGeoJSON(makeApiResponse([10000, 30000]))),
        "utf-8",
      );
      writeFileSync(
        `${savePath}.meta.json`,
        JSON.stringify({
          configHash: computeConfigHash("OLDTOKEN", alts),
          fetchedAt: Date.now() - 100_000,
          token: "OLDTOKEN",
          alts,
        }),
        "utf-8",
      );

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => makeApiResponse([10000, 30000]),
      } as Response);

      await initHeyWhatsThat(newToken, alts, savePath);

      const meta = JSON.parse(readFileSync(`${savePath}.meta.json`, "utf-8"));
      expect(meta.token).toBe(newToken);
      expect(meta.configHash).toBe(computeConfigHash(newToken, alts));
    });

    it("re-fetches when the altitudes have changed", async () => {
      const token = "TOKEN";
      const staleAlts = "10000,30000";
      const newAlts = "5000,15000";

      writeFileSync(
        savePath,
        JSON.stringify(convertToGeoJSON(makeApiResponse([10000, 30000]))),
        "utf-8",
      );
      writeFileSync(
        `${savePath}.meta.json`,
        JSON.stringify({
          configHash: computeConfigHash(token, staleAlts),
          fetchedAt: Date.now(),
          token,
          alts: staleAlts,
        }),
        "utf-8",
      );

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => makeApiResponse([5000, 15000]),
      } as Response);

      await initHeyWhatsThat(token, newAlts, savePath);

      expect(fetchSpy).toHaveBeenCalledOnce();
    });
  });

  // ---- fetch failure graceful degradation -----------------------------------

  describe("fetch failure", () => {
    it("leaves getHeyWhatsThatUrl() undefined when the API returns a non-OK status", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
        json: async () => ({}),
      } as Response);

      await initHeyWhatsThat("BADTOKEN", "10000,30000", savePath);

      expect(getHeyWhatsThatUrl()).toBeUndefined();
    });

    it("leaves getHeyWhatsThatUrl() undefined when fetch throws a network error", async () => {
      vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
        new Error("Network unreachable"),
      );

      await initHeyWhatsThat("BADTOKEN", "10000,30000", savePath);

      expect(getHeyWhatsThatUrl()).toBeUndefined();
    });

    it("regression: leaves getHeyWhatsThatUrl() undefined when API returns empty rings", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: "BADTOKEN",
          lat: 0,
          lon: 0,
          elev_amsl: 0,
          refraction: "0.25",
          rings: [],
        }),
      } as Response);

      await initHeyWhatsThat("BADTOKEN", "10000,30000", savePath);

      expect(getHeyWhatsThatUrl()).toBeUndefined();
    });

    it("regression: does not overwrite a valid cached GeoJSON file when re-fetch fails", async () => {
      const token = "GOODTOKEN";
      const alts = "10000,30000";
      const configHash = computeConfigHash(token, alts);

      // Write valid cache
      const original = JSON.stringify(
        convertToGeoJSON(makeApiResponse([10000, 30000])),
      );
      writeFileSync(savePath, original, "utf-8");
      writeFileSync(
        `${savePath}.meta.json`,
        JSON.stringify({ configHash, fetchedAt: Date.now(), token, alts }),
        "utf-8",
      );

      // Change alts to force a cache-miss, but the fetch fails
      vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
        new Error("Network error"),
      );

      await initHeyWhatsThat(token, "5000", savePath);

      // The original GeoJSON must be untouched
      expect(readFileSync(savePath, "utf-8")).toBe(original);
    });

    it("does not create a GeoJSON file when the fetch fails", async () => {
      vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
        new Error("Network error"),
      );

      await initHeyWhatsThat("NEWTOKEN", "10000,30000", savePath);

      expect(existsSync(savePath)).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// readSavedGeoJSON
// ---------------------------------------------------------------------------

describe("readSavedGeoJSON", () => {
  let tmpDir: string;
  let savePath: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `hwt-read-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    savePath = join(tmpDir, "test.geojson");
  });

  afterEach(() => {
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("returns the file content when the file exists", () => {
    const content = '{"type":"FeatureCollection","features":[]}';
    writeFileSync(savePath, content, "utf-8");
    expect(readSavedGeoJSON(savePath)).toBe(content);
  });

  it("returns null when the file does not exist", () => {
    expect(readSavedGeoJSON(join(tmpDir, "nonexistent.geojson"))).toBeNull();
  });

  it("returns null for a path pointing to a missing directory", () => {
    expect(
      readSavedGeoJSON(join(tmpDir, "missing", "sub", "file.geojson")),
    ).toBeNull();
  });
});
