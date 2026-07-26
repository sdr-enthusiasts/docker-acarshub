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

import { useCallback, useMemo } from "react";
import { Layer, Source, useMap } from "react-map-gl/maplibre";
import { useAppStore } from "../../store/useAppStore";
import { useSettingsStore, useTheme } from "../../store/useSettingsStore";
import { createLogger } from "../../utils/logger";

const logger = createLogger("RangeRings");

// --- FEAT-RANGE-RINGS Phase B tuning constants -----------------------------
//
// See agent-docs/REMEDIATION_PLAN.md §15 FEAT-RANGE-RINGS for the full Phase
// A investigation. Summary of the root cause the constants below address:
// the old algorithm sized all rings to fit fully inside `minEdgeDistance`
// (the shortest of the 4 station-to-edge distances) with a flat 30% margin,
// which on a landscape map container — the common case — meant rings were
// sized to the *short* (north/south) axis and looked tiny against the much
// larger long axis. Every comparable tool surveyed (tar1090, dump1090-fa,
// dump1090-mutability) accepts rings clipping at the viewport edge as normal
// map behavior; this implementation now does the same for the *outer*
// rings, while still guaranteeing the *innermost* ring is always fully
// visible (never clipped).

/** Fraction of the nearest visible corner distance the outer ring targets. */
const CORNER_BUFFER = 0.9;

/**
 * Fraction of `minEdgeDistance` used as the outer-ring target when even the
 * corner-based target would clip the innermost ring (rare — see
 * `calculateRangeRingRadii`'s fallback branch). This is the old algorithm's
 * buffer, preserved as the safety net.
 */
const EDGE_FALLBACK_BUFFER = 0.7;

/** Ring count never drops below this, matching the original fixed count. */
const MIN_RING_COUNT = 3;

/** Ring count never exceeds this — more than 5 concentric rings reads as
 * clutter rather than useful reference data, even on a very wide desktop
 * viewport. */
const MAX_RING_COUNT = 5;

/** Below this container width (px), cap ring count at `MIN_RING_COUNT` —
 * matches the mobile breakpoint used elsewhere (DESIGN_LANGUAGE.md). */
const MOBILE_WIDTH_BREAKPOINT = 400;

/** Below this container width (px), cap ring count at 4. */
const TABLET_WIDTH_BREAKPOINT = 900;

/**
 * Determine the maximum number of range rings to render for a given map
 * container width. Narrower containers (mobile) get fewer rings so labels
 * don't crowd each other; wide desktop containers can support more.
 *
 * Exported for direct unit testing without needing to mount the component.
 */
export function getMaxRingCount(containerWidthPx: number | undefined): number {
  if (containerWidthPx === undefined) {
    return MIN_RING_COUNT;
  }
  if (containerWidthPx < MOBILE_WIDTH_BREAKPOINT) {
    return MIN_RING_COUNT;
  }
  if (containerWidthPx < TABLET_WIDTH_BREAKPOINT) {
    return 4;
  }
  return MAX_RING_COUNT;
}

/**
 * Compute the final list of ring radii (NM) given the pre-computed distance
 * inputs. Pulled out of the component's `useMemo` so the count-selection /
 * buffer logic is directly unit-testable with contrived distance values,
 * independent of constructing real lat/lon bounds.
 *
 * @param minEdgeDistance - shortest of the 4 station-to-edge distances (NM).
 *   Used as the hard "never clip the innermost ring" ceiling.
 * @param minCornerDistance - shortest of the 4 station-to-corner distances
 *   (NM). Used as the generous outer-ring target — outer rings are allowed
 *   to clip past this in the short axis, matching tar1090/dump1090 behavior.
 * @param maxRingCount - upper bound on ring count (from `getMaxRingCount`).
 * @param roundFn - nice-interval rounding function (injected so this stays a
 *   pure function of its inputs for testing).
 */
export function calculateRangeRingRadii(
  minEdgeDistance: number,
  minCornerDistance: number,
  maxRingCount: number,
  roundFn: (distance: number) => number,
): number[] {
  const outerTarget = Math.max(
    minCornerDistance * CORNER_BUFFER,
    minEdgeDistance * EDGE_FALLBACK_BUFFER,
  );

  for (let count = maxRingCount; count >= MIN_RING_COUNT; count--) {
    const step = roundFn(outerTarget / count);
    if (step <= minEdgeDistance) {
      return Array.from({ length: count }, (_, i) => step * (i + 1));
    }
  }

  // Fallback: even MIN_RING_COUNT rings at the corner-based target would
  // clip the innermost ring (only possible on near-square aspect ratios
  // where nice-interval rounding pushes the step just over minEdgeDistance).
  // Revert to the original edge-only formula, which always satisfies the
  // no-clip invariant by construction.
  const fallbackStep = roundFn(
    (minEdgeDistance * EDGE_FALLBACK_BUFFER) / MIN_RING_COUNT,
  );
  return [fallbackStep, fallbackStep * 2, fallbackStep * 3];
}

interface RangeRingsProps {
  /** Current map viewport state (used to calculate dynamic ring sizes) */
  viewState?: {
    longitude: number;
    latitude: number;
    zoom: number;
  };
}

/**
 * RangeRings Component
 *
 * Displays concentric circles around the ground station to visualize
 * reception range. Ring radii are dynamically calculated based on viewport
 * and zoom level, showing 3-5 rings depending on container width (see
 * `getMaxRingCount`) sized to reach close to the visible map's corner
 * distance, not just the shortest edge (see `calculateRangeRingRadii`).
 *
 * Uses GeoJSON circle approximation (64-point polygon) for MapLibre compatibility.
 */
export function RangeRings({ viewState }: RangeRingsProps) {
  const decoders = useAppStore((state) => state.decoders);
  const settings = useSettingsStore((state) => state.settings);
  const theme = useTheme();
  const { current: map } = useMap();

  // Check if range rings are enabled (backend AND user settings)
  const backendAllowsRangeRings = decoders?.adsb?.range_rings ?? true;
  const showRangeRings = backendAllowsRangeRings && settings.map.showRangeRings;

  // Theme-aware colors (MapLibre doesn't support CSS variables)
  const colors = {
    mocha: {
      blue: "#89b4fa",
      text: "#cdd6f4",
      base: "#1e1e2e",
    },
    latte: {
      blue: "#1e66f5",
      text: "#4c4f69",
      base: "#eff1f5",
    },
  };
  const themeColors = theme === "mocha" ? colors.mocha : colors.latte;

  // Determine station location (settings override backend)
  let stationLat = settings.map.stationLat;
  let stationLon = settings.map.stationLon;

  // Fallback to backend decoder config if user hasn't set custom location
  if (stationLat === 0 && stationLon === 0 && decoders?.adsb) {
    stationLat = decoders.adsb.lat;
    stationLon = decoders.adsb.lon;
  }

  /**
   * Calculate distance between two points in nautical miles
   * Uses Haversine formula for great circle distance
   */
  const calculateDistance = useCallback(
    (lat1: number, lon1: number, lat2: number, lon2: number): number => {
      const R = 3440.065; // Earth's radius in nautical miles
      const dLat = ((lat2 - lat1) * Math.PI) / 180;
      const dLon = ((lon2 - lon1) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) *
          Math.cos((lat2 * Math.PI) / 180) *
          Math.sin(dLon / 2) *
          Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    },
    [],
  );

  /**
   * Round distance to nice intervals (multiples of 10, 20, 50, 100, etc.)
   */
  const roundToNiceInterval = useCallback((distance: number): number => {
    if (distance <= 0) return 10;

    // Find the order of magnitude
    const magnitude = 10 ** Math.floor(Math.log10(distance));

    // Possible nice intervals at this magnitude
    const intervals = [
      magnitude * 1, // 10, 100, 1000
      magnitude * 2, // 20, 200, 2000
      magnitude * 5, // 50, 500, 5000
    ];

    // Find the closest interval
    const closest = intervals.reduce((prev, curr) =>
      Math.abs(curr - distance) < Math.abs(prev - distance) ? curr : prev,
    );

    return closest;
  }, []);

  /**
   * Calculate dynamic range ring radii based on current viewport.
   * Returns 3-5 rings (see `getMaxRingCount`) sized via
   * `calculateRangeRingRadii` — outer rings target the visible corner
   * distance (allowing short-axis clipping, like tar1090/dump1090), while
   * the innermost ring is always guaranteed fully visible.
   *
   * Size is derived from the *viewport's own* center (`viewState`), not
   * the station's position — this keeps ring size/count stable while
   * panning, and correct even when the station is off-center within the
   * current view (see FEAT-RANGE-RINGS Phase B fix-up in
   * agent-docs/REMEDIATION_PLAN.md §15). Rings are still drawn centered on
   * the station's real-world coordinates further down.
   */
  const rangeRings = useMemo(() => {
    if (!map || !viewState) {
      // Fallback to settings or defaults
      return settings.map.rangeRings.length > 0
        ? settings.map.rangeRings
        : [100, 200, 300];
    }

    try {
      // Get map bounds
      const bounds = map.getBounds();
      if (!bounds) {
        return settings.map.rangeRings.length > 0
          ? settings.map.rangeRings
          : [100, 200, 300];
      }

      const ne = bounds.getNorthEast();
      const sw = bounds.getSouthWest();

      // Ring SIZE is derived from the current *viewport's own* geometry —
      // distances measured from the map's center (viewState.latitude/
      // longitude), NOT from the station's position. This is deliberate:
      // the station is usually near the map center (the default camera
      // centers on it), but as soon as the user pans, the station drifts
      // off-center within the visible frame. Sizing off "station -> edge
      // distance" made minEdgeDistance collapse toward zero whenever the
      // station approached any edge of the pan — rings would shrink,
      // change count, or nearly disappear purely from panning, with no
      // zoom change at all. Sizing off "map-center -> edge distance"
      // instead means ring size only changes with zoom (and the smooth,
      // latitude-dependent Mercator scale factor), and is completely
      // stable under a pure pan. The rings are still *drawn* centered on
      // the station's real-world position (`createCircle`/
      // `createLabelPoints` below use `stationLat`/`stationLon`
      // unchanged) — only the SIZE calculation moved off the station.
      const viewCenterLat = viewState.latitude;
      const viewCenterLon = viewState.longitude;

      // Distance from the viewport center to each edge (north, south,
      // east, west) — i.e. the current view's own half-height/half-width.
      const distanceToNorth = calculateDistance(
        viewCenterLat,
        viewCenterLon,
        ne.lat,
        viewCenterLon,
      );
      const distanceToSouth = calculateDistance(
        viewCenterLat,
        viewCenterLon,
        sw.lat,
        viewCenterLon,
      );
      const distanceToEast = calculateDistance(
        viewCenterLat,
        viewCenterLon,
        viewCenterLat,
        ne.lng,
      );
      const distanceToWest = calculateDistance(
        viewCenterLat,
        viewCenterLon,
        viewCenterLat,
        sw.lng,
      );

      // Use the minimum distance to the nearest edge — the innermost ring
      // must never exceed this, so it's always fully visible.
      const minEdgeDistance = Math.min(
        distanceToNorth,
        distanceToSouth,
        distanceToEast,
        distanceToWest,
      );

      // Distance from the viewport center to each of the 4 corners; the
      // outer rings target this (more generous than minEdgeDistance) and
      // may clip in the short axis — normal map behavior, same as
      // tar1090/dump1090's static rings.
      const distanceToNE = calculateDistance(
        viewCenterLat,
        viewCenterLon,
        ne.lat,
        ne.lng,
      );
      const distanceToNW = calculateDistance(
        viewCenterLat,
        viewCenterLon,
        ne.lat,
        sw.lng,
      );
      const distanceToSE = calculateDistance(
        viewCenterLat,
        viewCenterLon,
        sw.lat,
        ne.lng,
      );
      const distanceToSW = calculateDistance(
        viewCenterLat,
        viewCenterLon,
        sw.lat,
        sw.lng,
      );
      const minCornerDistance = Math.min(
        distanceToNE,
        distanceToNW,
        distanceToSE,
        distanceToSW,
      );

      const containerWidth = map.getContainer?.().clientWidth;
      const maxRingCount = getMaxRingCount(containerWidth);

      return calculateRangeRingRadii(
        minEdgeDistance,
        minCornerDistance,
        maxRingCount,
        roundToNiceInterval,
      );
    } catch (error) {
      logger.error("Error calculating dynamic range rings", {
        error: error instanceof Error ? error.message : String(error),
      });
      // Fallback to settings or defaults
      return settings.map.rangeRings.length > 0
        ? settings.map.rangeRings
        : [100, 200, 300];
    }
  }, [
    map,
    viewState,
    settings.map.rangeRings,
    calculateDistance,
    roundToNiceInterval,
  ]);

  // Don't render if backend disables it, user disabled it, no rings configured, or no valid location
  if (!backendAllowsRangeRings || !showRangeRings || rangeRings.length === 0) {
    return null;
  }

  if (stationLat === 0 && stationLon === 0) {
    return null;
  }

  /**
   * Create a circle approximation as a GeoJSON polygon
   * Uses proper great circle calculation to create true circles on the map
   * @param centerLon - Center longitude
   * @param centerLat - Center latitude
   * @param radiusNM - Radius in nautical miles
   * @param points - Number of points in polygon (default 64)
   * @returns GeoJSON Polygon coordinates
   */
  const createCircle = (
    centerLon: number,
    centerLat: number,
    radiusNM: number,
    points = 64,
  ): number[][] => {
    const coords: number[][] = [];

    // Convert nautical miles to meters (1 NM = 1852 meters)
    const radiusMeters = radiusNM * 1852;

    // Earth's radius in meters
    const earthRadius = 6378137;

    // Convert center to radians
    const centerLatRad = (centerLat * Math.PI) / 180;
    const centerLonRad = (centerLon * Math.PI) / 180;

    // Angular distance in radians
    const angularDistance = radiusMeters / earthRadius;

    for (let i = 0; i <= points; i++) {
      const bearing = (i / points) * 2 * Math.PI;

      // Calculate point using great circle formula
      const pointLatRad = Math.asin(
        Math.sin(centerLatRad) * Math.cos(angularDistance) +
          Math.cos(centerLatRad) *
            Math.sin(angularDistance) *
            Math.cos(bearing),
      );

      const pointLonRad =
        centerLonRad +
        Math.atan2(
          Math.sin(bearing) *
            Math.sin(angularDistance) *
            Math.cos(centerLatRad),
          Math.cos(angularDistance) -
            Math.sin(centerLatRad) * Math.sin(pointLatRad),
        );

      // Convert back to degrees
      const pointLat = (pointLatRad * 180) / Math.PI;
      const pointLon = (pointLonRad * 180) / Math.PI;

      coords.push([pointLon, pointLat]);
    }

    return coords;
  };

  /**
   * Create label points at cardinal directions for each ring
   * Positioned slightly outside the ring to avoid overlap with station marker
   */
  const createLabelPoints = (
    centerLon: number,
    centerLat: number,
    radiusNM: number,
  ) => {
    // Add 5% to radius to position labels just outside the ring
    const labelRadiusNM = radiusNM * 1.05;
    const radiusMeters = labelRadiusNM * 1852;
    const earthRadius = 6378137;
    const centerLatRad = (centerLat * Math.PI) / 180;
    const centerLonRad = (centerLon * Math.PI) / 180;
    const angularDistance = radiusMeters / earthRadius;

    // Cardinal directions: North (0°), East (90°), South (180°), West (270°)
    const bearings = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];

    return bearings.map((bearing) => {
      const pointLatRad = Math.asin(
        Math.sin(centerLatRad) * Math.cos(angularDistance) +
          Math.cos(centerLatRad) *
            Math.sin(angularDistance) *
            Math.cos(bearing),
      );

      const pointLonRad =
        centerLonRad +
        Math.atan2(
          Math.sin(bearing) *
            Math.sin(angularDistance) *
            Math.cos(centerLatRad),
          Math.cos(angularDistance) -
            Math.sin(centerLatRad) * Math.sin(pointLatRad),
        );

      const pointLat = (pointLatRad * 180) / Math.PI;
      const pointLon = (pointLonRad * 180) / Math.PI;

      return [pointLon, pointLat];
    });
  };

  /**
   * Create GeoJSON FeatureCollection for all range rings
   */
  const geojsonData = {
    type: "FeatureCollection" as const,
    features: rangeRings.map((radius, index) => ({
      type: "Feature" as const,
      properties: {
        radius,
        index,
      },
      geometry: {
        type: "Polygon" as const,
        coordinates: [createCircle(stationLon, stationLat, radius)],
      },
    })),
  };

  /**
   * Create GeoJSON for label points at cardinal directions
   */
  const labelPointsData = {
    type: "FeatureCollection" as const,
    features: rangeRings.flatMap((radius) =>
      createLabelPoints(stationLon, stationLat, radius).map((coords) => ({
        type: "Feature" as const,
        properties: {
          radius,
          label: `${radius} NM`,
        },
        geometry: {
          type: "Point" as const,
          coordinates: coords,
        },
      })),
    ),
  };

  return (
    <>
      <Source id="range-rings" type="geojson" data={geojsonData}>
        {/* Ring outlines */}
        <Layer
          id="range-rings-outline"
          type="line"
          paint={{
            "line-color": themeColors.blue,
            "line-width": 2,
            "line-opacity": 0.6,
          }}
        />
      </Source>

      {/* Label points at cardinal directions */}
      <Source id="range-rings-labels" type="geojson" data={labelPointsData}>
        <Layer
          id="range-rings-label-text"
          type="symbol"
          layout={{
            "text-field": ["get", "label"],
            "text-size": 13,
            "text-anchor": "center",
            "text-offset": [0, 0],
            "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
          }}
          paint={{
            "text-color": themeColors.text,
            "text-halo-color": themeColors.base,
            "text-halo-width": 3,
            "text-opacity": 0.95,
          }}
        />
      </Source>
    </>
  );
}
