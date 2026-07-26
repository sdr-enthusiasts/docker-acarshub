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

// ----------------------------------------------------------------------------
// EFFECT-01: extracted from pages/LiveMapPage.tsx.
//
// Owns "which aircraft is followed" and keeping the map auto-centered on it:
// - One-time auto-focus/follow from the `?aircraft=` URL query parameter
//   (used by deep links from Search/Alerts pages), removed from the URL
//   once consumed.
// - Continuous re-centering on the followed aircraft's position as it
//   updates, skipped during active zoom gestures to avoid fighting the
//   user's own zoom/pan (uses `displayedAircraft`, which is itself frozen
//   during zoom, so this hook doesn't need to know about zoom internals
//   beyond the `isZooming` gate).
// ----------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import type { MapRef } from "react-map-gl/maplibre";
import type { SetURLSearchParams } from "react-router-dom";
import type { PairedAircraft } from "../utils/aircraftPairing";
import { mapLogger } from "../utils/logger";

export interface UseMapFollowedAircraftOptions {
  mapRef: React.RefObject<MapRef | null>;
  isMapLoaded: boolean;
  isZooming: boolean;
  /** Live paired aircraft — searched for the `?aircraft=` deep-link target. */
  pairedAircraft: PairedAircraft[];
  /** Zoom-frozen, pause-aware aircraft list — used for continuous re-centering. */
  displayedAircraft: PairedAircraft[];
  searchParams: URLSearchParams;
  setSearchParams: SetURLSearchParams;
}

export interface UseMapFollowedAircraftResult {
  followedAircraftHex: string | null;
  /** Follow (non-null hex) or unfollow (null) an aircraft. */
  handleFollowAircraft: (hex: string | null) => void;
}

export function useMapFollowedAircraft({
  mapRef,
  isMapLoaded,
  isZooming,
  pairedAircraft,
  displayedAircraft,
  searchParams,
  setSearchParams,
}: UseMapFollowedAircraftOptions): UseMapFollowedAircraftResult {
  const [followedAircraftHex, setFollowedAircraftHex] = useState<string | null>(
    null,
  );
  const [hasFocusedAircraft, setHasFocusedAircraft] = useState(false);

  // Focus on aircraft from URL parameter
  useEffect(() => {
    if (!isMapLoaded || hasFocusedAircraft || !mapRef.current) return;

    const aircraftParam = searchParams.get("aircraft");
    if (!aircraftParam) return;

    // Find the aircraft in the paired list (use live data, not frozen)
    const targetAircraft = pairedAircraft.find(
      (a) =>
        a.hex.toUpperCase() === aircraftParam.toUpperCase() ||
        a.flight?.toUpperCase() === aircraftParam.toUpperCase() ||
        a.tail?.toUpperCase() === aircraftParam.toUpperCase(),
    );

    if (targetAircraft?.lat && targetAircraft.lon) {
      mapLogger.info("Focusing on aircraft from URL", {
        hex: targetAircraft.hex,
        lat: targetAircraft.lat,
        lon: targetAircraft.lon,
      });

      mapRef.current.flyTo({
        center: [targetAircraft.lon, targetAircraft.lat],
        zoom: 10,
        duration: 1500,
      });

      setHasFocusedAircraft(true);

      // Start following the aircraft
      setFollowedAircraftHex(targetAircraft.hex);
      mapLogger.info("Auto-following aircraft from URL", {
        hex: targetAircraft.hex,
      });

      // Remove the query parameter after focusing
      searchParams.delete("aircraft");
      setSearchParams(searchParams, { replace: true });
    }
  }, [
    isMapLoaded,
    hasFocusedAircraft,
    pairedAircraft,
    searchParams,
    setSearchParams,
    mapRef,
  ]);

  const handleFollowAircraft = useCallback((hex: string | null) => {
    setFollowedAircraftHex(hex);
    if (hex) {
      mapLogger.info("Following aircraft", { hex });
    } else {
      mapLogger.info("Unfollowed aircraft");
    }
  }, []);

  // Auto-center on followed aircraft when position updates.
  // Skip updates during zoom operations to prevent race conditions.
  // Use displayedAircraft (frozen during zoom) to prevent jumps.
  useEffect(() => {
    if (!followedAircraftHex || !mapRef.current || isZooming) {
      return;
    }

    const followedAircraft = displayedAircraft.find(
      (a) => a.hex === followedAircraftHex,
    );

    if (followedAircraft?.lat && followedAircraft.lon) {
      const map = mapRef.current.getMap();
      const targetCenter: [number, number] = [
        followedAircraft.lon,
        followedAircraft.lat,
      ];

      // Always keep aircraft centered using flyTo (preserves zoom)
      // Short duration for smooth continuous re-centering
      map.flyTo({
        center: targetCenter,
        duration: 300,
        essential: true, // This animation is considered essential with respect to prefers-reduced-motion
      });
    } else if (followedAircraft === undefined) {
      // Aircraft no longer in ADS-B data, stop following
      mapLogger.info("Followed aircraft disappeared from ADS-B, unfollowing", {
        hex: followedAircraftHex,
      });
      setFollowedAircraftHex(null);
    }
  }, [followedAircraftHex, displayedAircraft, isZooming, mapRef]);

  return { followedAircraftHex, handleFollowAircraft };
}
