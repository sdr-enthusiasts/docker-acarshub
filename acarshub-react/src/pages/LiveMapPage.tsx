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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MapRef, ViewState } from "react-map-gl/maplibre";
import { useSearchParams } from "react-router-dom";
import { MapComponent, MapControls, MapLegend } from "../components/Map";
import { AircraftList } from "../components/Map/AircraftList";
import { getProviderConfig } from "../config/mapProviders";
import { socketService } from "../services/socket";
import { useAppStore } from "../store/useAppStore";
import { useSettingsStore, useTheme } from "../store/useSettingsStore";
import type { PairedAircraft } from "../utils/aircraftPairing";
import { pairADSBWithACARSMessages } from "../utils/aircraftPairing";
import { mapLogger } from "../utils/logger";

/**
 * LiveMapPage Component
 * Displays real-time aircraft positions on a map using ADS-B data and ACARS messages
 *
 * Features:
 * - High-performance MapLibre GL JS rendering
 * - Catppuccin-themed map styles (Mocha/Latte)
 * - Aircraft markers with rotation
 * - Data blocks with flight information
 * - NEXRAD weather radar overlay
 * - Range rings from station
 * - Filtering (ACARS-only, unread messages)
 * - Sortable aircraft list
 * - Pause/resume functionality with keyboard shortcut (p key)
 */
export const LiveMapPage = () => {
  const setCurrentPage = useAppStore((state) => state.setCurrentPage);
  const adsbAircraft = useAppStore((state) => state.adsbAircraft);
  const messageGroups = useAppStore((state) => state.messageGroups);
  const mapSettings = useSettingsStore((state) => state.settings.map);
  const theme = useTheme();
  const [searchParams, setSearchParams] = useSearchParams();

  const mapRef = useRef<MapRef>(null);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [hoveredAircraftHex, setHoveredAircraftHex] = useState<string | null>(
    null,
  );
  const [hasFocusedAircraft, setHasFocusedAircraft] = useState(false);
  const [followedAircraftHex, setFollowedAircraftHex] = useState<string | null>(
    null,
  );
  const [isZooming, setIsZooming] = useState(false);
  const zoomCooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  // Pause state (persisted to localStorage)
  const [isPaused, setIsPaused] = useState(() => {
    const saved = localStorage.getItem("liveMap.isPaused");
    return saved === "true";
  });

  // Frozen aircraft snapshot when paused
  const [frozenAircraft, setFrozenAircraft] = useState<PairedAircraft[]>([]);

  // Persist pause state to localStorage
  useEffect(() => {
    localStorage.setItem("liveMap.isPaused", String(isPaused));
  }, [isPaused]);

  // Pair ADS-B aircraft with ACARS message groups
  const pairedAircraft = useMemo(() => {
    const aircraft = adsbAircraft?.aircraft || [];
    return pairADSBWithACARSMessages(aircraft, messageGroups);
  }, [adsbAircraft, messageGroups]);

  // Use frozen aircraft when paused, live data when not paused
  const effectiveAircraft = isPaused ? frozenAircraft : pairedAircraft;

  // Freeze aircraft positions during zoom
  const frozenAircraftRef = useRef<PairedAircraft[]>(effectiveAircraft);
  const [displayedAircraft, setDisplayedAircraft] =
    useState<PairedAircraft[]>(effectiveAircraft);

  // Update displayed aircraft only when not zooming and not paused
  useEffect(() => {
    if (!isZooming) {
      setDisplayedAircraft(effectiveAircraft);
      frozenAircraftRef.current = effectiveAircraft;
    }
  }, [effectiveAircraft, isZooming]);

  // Capture aircraft snapshot when pausing (only when pause state changes)
  // Use a ref to always get the latest pairedAircraft at the moment of pausing
  const pairedAircraftRef = useRef(pairedAircraft);
  pairedAircraftRef.current = pairedAircraft;

  useEffect(() => {
    if (isPaused) {
      // Capture snapshot at the moment of pausing
      setFrozenAircraft(pairedAircraftRef.current);
      mapLogger.info("Aircraft updates paused", {
        aircraftCount: pairedAircraftRef.current.length,
      });
    } else {
      mapLogger.info("Aircraft updates resumed");
    }
  }, [isPaused]);

  useEffect(() => {
    setCurrentPage("Live Map");
    socketService.notifyPageChange("Live Map");
  }, [setCurrentPage]);

  // Keyboard shortcut: 'p' to toggle pause
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore if user is typing in an input field
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (event.key === "p" || event.key === "P") {
        event.preventDefault();
        setIsPaused((prev) => !prev);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleMapLoad = useCallback(() => {
    setIsMapLoaded(true);
    mapLogger.info("Map loaded successfully");
  }, []);

  // Fallback timeout for mobile Safari - if map doesn't fire load event within 10 seconds, assume it's loaded
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (!isMapLoaded) {
        mapLogger.warn(
          "Map load timeout - forcing loaded state for mobile Safari compatibility",
        );
        setIsMapLoaded(true);
      }
    }, 10000); // 10 second timeout

    return () => clearTimeout(timeoutId);
  }, [isMapLoaded]);

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
  ]);

  // Handle aircraft click from list
  const handleAircraftClick = (aircraft: PairedAircraft) => {
    // Center map on aircraft if position available
    if (aircraft.lat && aircraft.lon && mapRef.current) {
      mapRef.current.flyTo({
        center: [aircraft.lon, aircraft.lat],
        zoom: 10,
        duration: 1000,
      });
    }
  };

  // Handle aircraft hover from list
  const handleAircraftHover = (aircraft: PairedAircraft | null) => {
    setHoveredAircraftHex(aircraft?.hex || null);
  };

  // Handle follow aircraft
  const handleFollowAircraft = (hex: string | null) => {
    setFollowedAircraftHex(hex);
    if (hex) {
      mapLogger.info("Following aircraft", { hex });
    } else {
      mapLogger.info("Unfollowed aircraft");
    }
  };

  // Handle zoom state tracking with cooldown
  const previousZoomRef = useRef<number | null>(null);

  const handleViewStateChange = useCallback(
    (viewState: ViewState) => {
      const currentZoom = viewState.zoom;

      // Initialize previous zoom on first call
      if (previousZoomRef.current === null) {
        previousZoomRef.current = currentZoom;
        return;
      }

      // Detect zoom change
      if (Math.abs(currentZoom - previousZoomRef.current) > 0.01) {
        // Zoom is happening
        if (!isZooming) {
          mapLogger.debug("Zoom detected, freezing aircraft positions");
          // Freeze current aircraft positions
          frozenAircraftRef.current = pairedAircraft;
          setDisplayedAircraft(frozenAircraftRef.current);
        }
        setIsZooming(true);

        // Clear any existing cooldown timer
        if (zoomCooldownTimerRef.current) {
          clearTimeout(zoomCooldownTimerRef.current);
        }

        // Set a new cooldown timer (200ms after zoom stops)
        zoomCooldownTimerRef.current = setTimeout(() => {
          setIsZooming(false);
          mapLogger.debug(
            "Zoom cooldown complete, unfreezing aircraft positions",
          );
          // Unfreeze - the effect will update displayedAircraft with latest pairedAircraft
        }, 200);
      }

      previousZoomRef.current = currentZoom;
    },
    [isZooming, pairedAircraft],
  );

  // Cleanup zoom cooldown timer on unmount
  useEffect(() => {
    return () => {
      if (zoomCooldownTimerRef.current) {
        clearTimeout(zoomCooldownTimerRef.current);
      }
    };
  }, []);

  // Auto-center on followed aircraft when position updates
  // Skip updates during zoom operations to prevent race conditions
  // Use displayedAircraft (frozen during zoom) to prevent jumps
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
  }, [followedAircraftHex, displayedAircraft, isZooming]);

  // Handle pause toggle from button
  const handlePauseToggle = useCallback(() => {
    setIsPaused((prev) => !prev);
  }, []);

  return (
    <div className="page live-map-page">
      <div className="live-map-page__container">
        {/* Aircraft list sidebar */}
        <aside className="live-map-page__sidebar">
          <AircraftList
            aircraft={displayedAircraft}
            onAircraftClick={handleAircraftClick}
            onAircraftHover={handleAircraftHover}
            hoveredAircraft={hoveredAircraftHex}
            isPaused={isPaused}
            onPauseToggle={handlePauseToggle}
          />
        </aside>

        {/* Map container (main area) */}
        <main className="live-map-page__map">
          <MapComponent
            mapRef={mapRef}
            onLoad={handleMapLoad}
            onViewStateChange={handleViewStateChange}
            hoveredAircraftHex={hoveredAircraftHex}
            followedAircraftHex={followedAircraftHex}
            onFollowAircraft={handleFollowAircraft}
            aircraft={displayedAircraft}
            isPaused={isPaused}
            onTogglePause={handlePauseToggle}
            className={isMapLoaded ? "live-map-page__map--loaded" : ""}
          />

          {/* Floating map controls */}
          {isMapLoaded && (
            <MapControls
              isPaused={isPaused}
              onTogglePause={handlePauseToggle}
              isFollowingAircraft={!!followedAircraftHex}
              onUnfollowAircraft={() => handleFollowAircraft(null)}
            />
          )}

          {/* Map legend */}
          {isMapLoaded && <MapLegend />}

          {!isMapLoaded && (
            <div className="live-map-page__map-loading">
              <p className="live-map-page__pulse-dots">●●●</p>
              <p>Loading map...</p>
            </div>
          )}

          {/* Pause indicator */}
          {isMapLoaded && isPaused && (
            <div className="live-map-page__pause-notice">
              <span className="pause-notice__icon">⏸</span>
              <span className="pause-notice__text">
                Updates paused. Press <kbd>p</kbd> or click Resume to continue.
              </span>
            </div>
          )}

          {/* Map overlay info (top-left corner) */}
          {isMapLoaded && (
            <div className="live-map-page__map-info">
              <div className="live-map-page__map-provider">
                Provider:{" "}
                {getProviderConfig(mapSettings.provider)?.name ||
                  (mapSettings.provider === "custom"
                    ? "Custom"
                    : "Theme-Aware")}
                {!mapSettings.userSelectedProvider && (
                  <span className="live-map-page__theme-badge">
                    🎨 {theme === "mocha" ? "Dark" : "Light"}
                  </span>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
