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
 * Hey What's That Antenna Coverage Service
 *
 * Fetches antenna coverage outlines from heywhatsthat.com once at startup
 * and converts them to GeoJSON for display on the live map.
 *
 * Why single-fetch-with-cache?
 * The HWT data is purely a function of antenna placement and terrain — it
 * never changes unless the user explicitly changes their HWT site or the
 * requested altitudes.  Fetching on every startup (when the cache is valid)
 * would impose unnecessary load on a free public API and slow startup.
 *
 * Cache invalidation strategy:
 * - A SHA-256 hash of `${token}:${alts}` is stored in a sidecar metadata
 *   file (<savePath>.meta.json) next to the GeoJSON.
 * - On startup we compare the current config hash to the stored hash.
 * - Only if they differ (or the files are missing) do we re-fetch.
 *
 * GeoJSON format produced:
 * - FeatureCollection with one Polygon Feature per altitude ring.
 * - Each Feature's properties include `altitude` (number) and
 *   `altitude_label` (human-readable string, e.g. "10,000 ft").
 * - Coordinates are [lon, lat] as required by GeoJSON / RFC 7946.
 * - Polygons are explicitly closed (first === last coordinate).
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  HEYWHATSTHAT_ALTS,
  HEYWHATSTHAT_ID,
  HEYWHATSTHAT_SAVE,
} from "../config.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("heywhatsthat");

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Fixed refraction value used when calling the HWT API */
const HWT_REFRACTION = "0.25";

/** Base URL for the HWT upintheair API */
const HWT_API_BASE = "https://www.heywhatsthat.com/api/upintheair.json";

/**
 * Cache schema version — bump this whenever the GeoJSON structure or the
 * unit/conversion logic changes so that all existing cached files are
 * automatically invalidated on the next startup.
 *
 * History:
 *   "0" — initial implementation (incorrectly sent feet as meters to API)
 *   "1" — corrected: user-configured feet are converted to meters before the
 *          API call; ring.alt (meters) is converted back to feet for storage
 */
const CACHE_SCHEMA_VERSION = "1";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Minimal GeoJSON types used internally (avoids pulling in @types/geojson) */
interface GeoJSONPosition {
  0: number; // longitude
  1: number; // latitude
}

interface GeoJSONPolygon {
  type: "Polygon";
  coordinates: [GeoJSONPosition[]]; // [exterior ring]
}

interface GeoJSONFeature {
  type: "Feature";
  properties: {
    altitude: number;
    altitude_label: string;
    ring_index: number;
  };
  geometry: GeoJSONPolygon;
}

export interface HWTGeoJSON {
  type: "FeatureCollection";
  features: GeoJSONFeature[];
}

// ---------------------------------------------------------------------------
// HWT API response types
// ---------------------------------------------------------------------------

interface HWTRing {
  /** Array of [lat, lon] pairs — note: lat first, lon second (opposite of GeoJSON) */
  points: [number, number][];
  /** Altitude in feet as a string (e.g. "10000") */
  alt: string;
}

interface HWTApiResponse {
  id: string;
  lat: number;
  lon: number;
  elev_amsl: number;
  refraction: string;
  rings: HWTRing[];
}

// ---------------------------------------------------------------------------
// Metadata sidecar type
// ---------------------------------------------------------------------------

interface HWTMeta {
  /** SHA-256 hash of `${token}:${alts}` */
  configHash: string;
  /** Unix timestamp (ms) of when the file was fetched */
  fetchedAt: number;
  /** The HWT site token at the time of fetch */
  token: string;
  /** The altitude list at the time of fetch */
  alts: string;
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

/** Cached URL (with ?v= param) returned to connected clients */
let cachedUrl: string | undefined;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute a short (16-character hex) SHA-256 fingerprint of the current
 * HWT configuration.  Used both as the `?v=` cache-bust token in the URL
 * and as the cache-validity key stored in the sidecar metadata file.
 */
export function computeConfigHash(token: string, alts: string): string {
  return createHash("sha256")
    .update(`${token}:${alts}:v${CACHE_SCHEMA_VERSION}`)
    .digest("hex")
    .slice(0, 16);
}

/**
 * Return the path to the sidecar metadata file for a given GeoJSON save path.
 */
function metaPath(savePath: string): string {
  return `${savePath}.meta.json`;
}

/**
 * Read the sidecar metadata for a saved GeoJSON, or null if absent / invalid.
 */
function readMeta(savePath: string): HWTMeta | null {
  const mp = metaPath(savePath);
  if (!existsSync(mp)) return null;
  try {
    const raw = readFileSync(mp, "utf-8");
    return JSON.parse(raw) as HWTMeta;
  } catch {
    return null;
  }
}

/**
 * Write the sidecar metadata file alongside the GeoJSON.
 */
function writeMeta(savePath: string, meta: HWTMeta): void {
  writeFileSync(metaPath(savePath), JSON.stringify(meta, null, 2), "utf-8");
}

/**
 * Format an altitude number as a human-readable string with thousands
 * separators and the "ft" suffix (e.g. 10000 → "10,000 ft").
 */
function formatAltitudeLabel(altFt: number): string {
  return `${altFt.toLocaleString("en-US")} ft`;
}

/**
 * Convert a comma-separated list of altitudes in feet to a comma-separated
 * list of altitudes in meters, suitable for the HWT API's `alts` parameter.
 *
 * The HWT API expects altitudes in **meters**.  We expose `HEYWHATSTHAT_ALTS`
 * to operators in **feet** (matching every other altitude reference in ACARS
 * Hub) and convert here before building the API URL.
 *
 * Example: "10000,30000" → "3048,9144"
 */
export function feetAltListToMeters(altsFeet: string): string {
  return altsFeet
    .split(",")
    .map((a) => Math.round(Number.parseInt(a.trim(), 10) * 0.3048))
    .join(",");
}

/**
 * Convert an altitude value returned by the HWT API (meters) to feet.
 *
 * The API returns the altitude string that was passed in the `alts` query
 * parameter — i.e. meters.  We store and display altitudes in feet.
 */
function metersToFeet(meters: number): number {
  return Math.round(meters / 0.3048);
}

/**
 * Convert a HWT ring's `points` array (which uses [lat, lon] ordering) into
 * a closed GeoJSON exterior ring (which uses [lon, lat] ordering).
 *
 * GeoJSON polygons MUST be closed — the first and last positions must be
 * identical.  If the HWT API already closes the ring we keep it as-is;
 * otherwise we append a copy of the first point.
 */
function convertPointsToGeoJSONRing(
  points: [number, number][],
): GeoJSONPosition[] {
  if (points.length < 3) {
    throw new Error(
      `HWT ring has too few points to form a polygon (${points.length})`,
    );
  }

  // Swap lat/lon → lon/lat for GeoJSON compliance
  const coords: GeoJSONPosition[] = points.map(
    ([lat, lon]) => [lon, lat] as GeoJSONPosition,
  );

  // Close the ring if not already closed
  const first = coords[0];
  const last = coords[coords.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    coords.push([first[0], first[1]] as GeoJSONPosition);
  }

  return coords;
}

/**
 * Convert a full HWT API response into a GeoJSON FeatureCollection.
 *
 * The HWT API returns altitudes in **meters** (matching the unit used in the
 * `alts` query parameter).  We convert to feet for storage and display so
 * that all altitude values in ACARS Hub are consistently in feet.
 */
export function convertToGeoJSON(apiResponse: HWTApiResponse): HWTGeoJSON {
  const features: GeoJSONFeature[] = apiResponse.rings.map((ring, index) => {
    // ring.alt is in meters (the value we sent to the API, converted from feet)
    const altMeters = Number.parseInt(ring.alt, 10);
    const altitude = metersToFeet(altMeters);
    const ring_coords = convertPointsToGeoJSONRing(ring.points);

    return {
      type: "Feature",
      properties: {
        altitude,
        altitude_label: formatAltitudeLabel(altitude),
        ring_index: index,
      },
      geometry: {
        type: "Polygon",
        coordinates: [ring_coords],
      },
    };
  });

  return {
    type: "FeatureCollection",
    features,
  };
}

// ---------------------------------------------------------------------------
// Core fetch / cache logic
// ---------------------------------------------------------------------------

/**
 * Fetch coverage data from the HWT API and return the parsed response.
 * Throws on HTTP errors or JSON parse failures.
 */
async function fetchFromApi(
  token: string,
  alts: string,
): Promise<HWTApiResponse> {
  // `alts` is the user-configured value in feet (e.g. "10000,30000").
  // The HWT API expects meters, so we convert before building the URL.
  const altsMeters = feetAltListToMeters(alts);
  const url = `${HWT_API_BASE}?id=${encodeURIComponent(token)}&refraction=${HWT_REFRACTION}&alts=${encodeURIComponent(altsMeters)}`;

  logger.info("Fetching Hey What's That coverage data", { url });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000); // 30 s timeout

  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new Error(
      `HWT API returned HTTP ${response.status}: ${response.statusText}`,
    );
  }

  const data = (await response.json()) as HWTApiResponse;

  if (!data.rings || !Array.isArray(data.rings) || data.rings.length === 0) {
    throw new Error(
      `HWT API response for token "${token}" contains no rings — verify the token is valid`,
    );
  }

  logger.info("Hey What's That coverage data fetched successfully", {
    token,
    rings: data.rings.length,
    // Log human-readable feet values (ring.alt is meters from the API)
    alts: data.rings
      .map(
        (r) =>
          `${metersToFeet(Number.parseInt(r.alt, 10)).toLocaleString("en-US")} ft`,
      )
      .join(", "),
    stationLat: data.lat,
    stationLon: data.lon,
    elevAmsl: data.elev_amsl,
  });

  return data;
}

/**
 * Ensure the directory for `savePath` exists, creating it (recursively) if not.
 */
function ensureSaveDir(savePath: string): void {
  const dir = dirname(savePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Return the URL that clients should use to fetch the HWT GeoJSON overlay,
 * or `undefined` when HeyWhatsThat is not configured.
 *
 * The URL is always `/data/heywhatsthat.geojson?v=<configHash>`.  The `?v=`
 * parameter acts as a cache-bust token: when the user changes the token or
 * altitudes the hash changes, causing browsers to ignore their cached copy.
 */
export function getHeyWhatsThatUrl(): string | undefined {
  return cachedUrl;
}

/**
 * Read the saved GeoJSON file and return its content, or null if not found.
 * Used by the Fastify endpoint to serve the file.
 */
export function readSavedGeoJSON(
  savePath: string = HEYWHATSTHAT_SAVE,
): string | null {
  if (!existsSync(savePath)) return null;
  try {
    return readFileSync(savePath, "utf-8");
  } catch {
    return null;
  }
}

/**
 * Initialize the HeyWhatsThat service at startup.
 *
 * Behaviour:
 * 1. If `HEYWHATSTHAT` env var is not set (empty), the service is a no-op and
 *    `getHeyWhatsThatUrl()` returns `undefined`.
 * 2. If the cached GeoJSON file exists and its sidecar metadata hash matches
 *    the current config hash, the service reuses the cached data.
 * 3. Otherwise, fetch fresh data from the HWT API, convert to GeoJSON, and
 *    write both the GeoJSON and the sidecar metadata to disk.
 *
 * This function is idempotent and safe to call multiple times (re-uses cached
 * state after the first successful initialisation).
 */
export async function initHeyWhatsThat(
  token: string = HEYWHATSTHAT_ID,
  alts: string = HEYWHATSTHAT_ALTS,
  savePath: string = HEYWHATSTHAT_SAVE,
): Promise<void> {
  if (!token) {
    logger.debug("HEYWHATSTHAT not configured — coverage overlay disabled");
    cachedUrl = undefined;
    return;
  }

  const configHash = computeConfigHash(token, alts);
  const urlWithVersion = `/data/heywhatsthat.geojson?v=${configHash}`;

  // Check if we already have a valid cached file
  if (existsSync(savePath)) {
    const meta = readMeta(savePath);
    if (meta?.configHash === configHash) {
      logger.info("Hey What's That coverage data is up-to-date (cache hit)", {
        token,
        alts,
        configHash,
        savePath,
        cachedAt: new Date(meta.fetchedAt).toISOString(),
      });
      cachedUrl = urlWithVersion;
      return;
    }

    logger.info("Hey What's That config changed — re-fetching coverage data", {
      token,
      alts,
      oldHash: meta?.configHash ?? "(no meta)",
      newHash: configHash,
    });
  } else {
    logger.info("Hey What's That coverage cache not found — fetching", {
      token,
      alts,
      savePath,
    });
  }

  try {
    const apiData = await fetchFromApi(token, alts);
    const geoJSON = convertToGeoJSON(apiData);
    const geoJSONStr = JSON.stringify(geoJSON, null, 2);

    ensureSaveDir(savePath);
    writeFileSync(savePath, geoJSONStr, "utf-8");

    const meta: HWTMeta = {
      configHash,
      fetchedAt: Date.now(),
      token,
      alts,
    };
    writeMeta(savePath, meta);

    logger.info("Hey What's That coverage data saved", {
      savePath,
      features: geoJSON.features.length,
      altitudes: geoJSON.features
        .map((f) => f.properties.altitude_label)
        .join(", "),
    });

    cachedUrl = urlWithVersion;
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error(
      "Failed to fetch Hey What's That coverage data — overlay will be unavailable",
      { error: error.message, token, alts },
    );
    // Don't set cachedUrl — feature gracefully degrades to disabled
    cachedUrl = undefined;
  }
}
