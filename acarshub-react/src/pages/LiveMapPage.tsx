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

import { useCallback, useMemo, useRef, useState } from "react";
import type { MapRef } from "react-map-gl/maplibre";
import { useSearchParams } from "react-router-dom";
import { IconChevronRight } from "../components/icons";
import { MapComponent, MapControls, MapLegend } from "../components/Map";
import { AircraftList } from "../components/Map/AircraftList";
import type { ViewportBounds } from "../components/Map/AircraftMarkers";
import { getProviderConfig } from "../config/mapProviders";
import { useMapFollowedAircraft } from "../hooks/useMapFollowedAircraft";
import { useMapLifecycle } from "../hooks/useMapLifecycle";
import { useMapPauseState } from "../hooks/useMapPauseState";
import {
  SIDEBAR_MIN_WIDTH,
  useMapSidebarLayout,
} from "../hooks/useMapSidebarLayout";
import { useMapZoomFreeze } from "../hooks/useMapZoomFreeze";
import { useAppStore } from "../store/useAppStore";
import { useSettingsStore, useTheme } from "../store/useSettingsStore";
import type { PairedAircraft } from "../utils/aircraftPairing";
import { pairADSBWithACARSMessages } from "../utils/aircraftPairing";

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
 *
 * EFFECT-01: the page's original 12 useEffects (view/sidebar layout, pause,
 * zoom freezing, follow-mode, map lifecycle) have been extracted into
 * domain hooks under src/hooks/useMap*.ts. This component now composes
 * those hooks and renders; see each hook's own file for the effects it owns.
 */
export const LiveMapPage = () => {
  const setCurrentPage = useAppStore((state) => state.setCurrentPage);
  const adsbAircraft = useAppStore((state) => state.adsbAircraft);
  const messageGroups = useAppStore((state) => state.messageGroups);
  const mapSettings = useSettingsStore((state) => state.settings.map);
  const setMapSidebarWidth = useSettingsStore(
    (state) => state.setMapSidebarWidth,
  );
  const setMapSidebarCollapsed = useSettingsStore(
    (state) => state.setMapSidebarCollapsed,
  );
  const theme = useTheme();
  const [searchParams, setSearchParams] = useSearchParams();

  const mapRef = useRef<MapRef>(null);

  const { isMapLoaded, handleMapLoad } = useMapLifecycle({ setCurrentPage });

  const [hoveredAircraftHex, setHoveredAircraftHex] = useState<string | null>(
    null,
  );
  const [viewportBounds, setViewportBounds] = useState<ViewportBounds | null>(
    null,
  );

  // Pair ADS-B aircraft with ACARS message groups
  const pairedAircraft = useMemo(() => {
    const aircraft = adsbAircraft?.aircraft || [];
    return pairADSBWithACARSMessages(aircraft, messageGroups);
  }, [adsbAircraft, messageGroups]);

  // Count distinct decoder types currently present across all live aircraft.
  // This drives the sidebar layout hook's dynamic max width so the sidebar
  // never gets wider than needed to display all active decoder badges in
  // the callsign column.
  const numActiveDecoders = useMemo(() => {
    const types = new Set<string>();
    for (const a of pairedAircraft) {
      for (const dt of a.decoderTypes) {
        types.add(dt);
      }
    }
    return types.size;
  }, [pairedAircraft]);

  const {
    containerRef,
    sidebarWidth,
    sidebarMaxWidth,
    isResizing,
    isSidebarCollapsed,
    handleResizeMouseDown,
    handleResizeKeyDown,
    handleCollapseToggle,
  } = useMapSidebarLayout({
    storedSidebarWidth: mapSettings.mapSidebarWidth,
    storedSidebarCollapsed: mapSettings.mapSidebarCollapsed,
    setMapSidebarWidth,
    setMapSidebarCollapsed,
    numActiveDecoders,
  });

  const { isPaused, handlePauseToggle, effectiveAircraft } = useMapPauseState({
    pairedAircraft,
  });

  const { isZooming, displayedAircraft, handleViewStateChange } =
    useMapZoomFreeze({ pairedAircraft, effectiveAircraft });

  const { followedAircraftHex, handleFollowAircraft } = useMapFollowedAircraft({
    mapRef,
    isMapLoaded,
    isZooming,
    pairedAircraft,
    displayedAircraft,
    searchParams,
    setSearchParams,
  });

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
  const handleAircraftHover = useCallback((aircraft: PairedAircraft | null) => {
    setHoveredAircraftHex(aircraft?.hex || null);
  }, []);

  return (
    <div className="page live-map-page">
      {/* ref used to apply --map-sidebar-width CSS custom property */}
      <div className="live-map-page__container" ref={containerRef}>
        {/* Aircraft list sidebar */}
        <aside
          className={`live-map-page__sidebar${isSidebarCollapsed ? " live-map-page__sidebar--collapsed" : ""}`}
        >
          {isSidebarCollapsed ? (
            <button
              type="button"
              className="live-map-page__sidebar-expand-button"
              onClick={handleCollapseToggle}
              title="Expand sidebar"
              aria-label="Expand sidebar"
            >
              <IconChevronRight />
            </button>
          ) : (
            <AircraftList
              aircraft={displayedAircraft}
              onAircraftClick={handleAircraftClick}
              onAircraftHover={handleAircraftHover}
              hoveredAircraft={hoveredAircraftHex}
              isPaused={isPaused}
              onPauseToggle={handlePauseToggle}
              onCollapseToggle={handleCollapseToggle}
              viewportBounds={viewportBounds}
              sidebarWidth={sidebarWidth}
            />
          )}
        </aside>

        {/* Drag handle – hidden on mobile and when sidebar is collapsed */}
        {/* role="separator" with aria-valuenow/min/max is the correct ARIA
            pattern for a resize splitter (WCAG 2.1 §4.1.2).  tabIndex makes
            it keyboard-reachable; arrow keys are handled below. */}
        {!isSidebarCollapsed && (
          // biome-ignore lint/a11y/useSemanticElements: ARIA APG "Window Splitter" pattern requires role="separator" with aria-valuenow on a focusable element; <hr> cannot carry these interactive attributes.
          <div
            className={`live-map-page__sidebar-resize-handle${isResizing ? " live-map-page__sidebar-resize-handle--dragging" : ""}`}
            onMouseDown={handleResizeMouseDown}
            onKeyDown={handleResizeKeyDown}
            role="separator"
            aria-label="Sidebar resize handle"
            aria-orientation="vertical"
            aria-valuenow={sidebarWidth}
            aria-valuemin={SIDEBAR_MIN_WIDTH}
            aria-valuemax={sidebarMaxWidth}
            tabIndex={0}
            title="Drag or use arrow keys to resize sidebar"
          />
        )}

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
            onViewportBoundsChange={setViewportBounds}
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
