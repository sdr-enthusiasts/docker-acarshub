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
 * and zoom level, always showing 3 rings that fit the current view.
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
   * Calculate dynamic range ring radii based on current viewport
   * Returns 3 rings that fit nicely in the current view
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

      // Calculate distances from station to each edge (not corners)
      const ne = bounds.getNorthEast();
      const sw = bounds.getSouthWest();

      // Distance to each edge (north, south, east, west)
      const distanceToNorth = calculateDistance(
        stationLat,
        stationLon,
        ne.lat,
        stationLon,
      );
      const distanceToSouth = calculateDistance(
        stationLat,
        stationLon,
        sw.lat,
        stationLon,
      );
      const distanceToEast = calculateDistance(
        stationLat,
        stationLon,
        stationLat,
        ne.lng,
      );
      const distanceToWest = calculateDistance(
        stationLat,
        stationLon,
        stationLat,
        sw.lng,
      );

      // Use the minimum distance to the nearest edge
      const minEdgeDistance = Math.min(
        distanceToNorth,
        distanceToSouth,
        distanceToEast,
        distanceToWest,
      );

      // Use 70% of nearest edge distance for safety margin (prevents clipping)
      const maxDistance = minEdgeDistance * 0.7;

      // Calculate ring spacing (divide by 3 for 3 rings)
      const spacing = maxDistance / 3;
      const roundedSpacing = roundToNiceInterval(spacing);

      // Generate 3 rings with nice rounded intervals
      return [roundedSpacing, roundedSpacing * 2, roundedSpacing * 3];
    } catch (error) {
      console.error("Error calculating dynamic range rings:", error);
      // Fallback to settings or defaults
      return settings.map.rangeRings.length > 0
        ? settings.map.rangeRings
        : [100, 200, 300];
    }
  }, [
    map,
    viewState,
    stationLat,
    stationLon,
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
