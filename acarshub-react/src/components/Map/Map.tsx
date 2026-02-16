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

import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  MapRef,
  ViewState,
  ViewStateChangeEvent,
} from "react-map-gl/maplibre";
import MapLibreMap, {
  NavigationControl,
  ScaleControl,
} from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  getProviderConfig,
  getProviderTileUrl,
} from "../../config/mapProviders";
import { useAppStore } from "../../store/useAppStore";
import { useSettingsStore } from "../../store/useSettingsStore";
import type { PairedAircraft } from "../../utils/aircraftPairing";
import { mapLogger } from "../../utils/logger";
import { AircraftMarkers } from "./AircraftMarkers";
import { GeoJSONOverlays } from "./GeoJSONOverlays";
import { MapContextMenu } from "./MapContextMenu";
import { NexradOverlay } from "./NexradOverlay";
import { OpenAIPOverlay } from "./OpenAIPOverlay";
import { RainViewerOverlay } from "./RainViewerOverlay";
import { RangeRings } from "./RangeRings";
import { StationMarker } from "./StationMarker";
import "../../styles/components/_map.scss";

interface MapComponentProps {
  /** Optional className for styling */
  className?: string;
  /** Optional ref to access the map instance */
  mapRef?: React.RefObject<MapRef | null>;
  /** Callback when map is loaded */
  onLoad?: () => void;
  /** Callback when map view changes */
  onViewStateChange?: (viewState: ViewState) => void;
  /** Hex of currently hovered aircraft (from list) */
  hoveredAircraftHex?: string | null;
  /** Hex of currently followed aircraft */
  followedAircraftHex?: string | null;
  /** Callback when follow/unfollow is requested */
  onFollowAircraft?: (hex: string | null) => void;
  /** Optional pre-paired aircraft (for frozen positions during zoom) */
  aircraft?: PairedAircraft[];
  /** Whether updates are paused */
  isPaused?: boolean;
  /** Callback when pause state should be toggled */
  onTogglePause?: () => void;
}

/**
 * Map Component
 *
 * High-performance map using MapLibre GL JS.
 * Supports multiple tile providers: OpenStreetMap, CARTO, OpenFreeMap, ESRI, aviation charts, and custom URLs.
 */
export function MapComponent({
  className = "",
  mapRef,
  onLoad,
  onViewStateChange,
  hoveredAircraftHex,
  followedAircraftHex,
  onFollowAircraft,
  aircraft,
  isPaused = false,
  onTogglePause,
}: MapComponentProps) {
  const decoders = useAppStore((state) => state.decoders);
  const mapSettings = useSettingsStore((state) => state.settings.map);

  // Get initial view state from localStorage or ADSB location
  const getInitialViewState = (): ViewState => {
    // Try to restore from localStorage
    const saved = localStorage.getItem("map.viewState");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          longitude: parsed.longitude,
          latitude: parsed.latitude,
          zoom: parsed.zoom,
          bearing: 0,
          pitch: 0,
          padding: { top: 0, bottom: 0, left: 0, right: 0 },
        };
      } catch {
        // Fall through to defaults
      }
    }

    // Use ADSB location if available
    if (decoders?.adsb?.lat && decoders?.adsb?.lon) {
      return {
        longitude: decoders.adsb.lon,
        latitude: decoders.adsb.lat,
        zoom: 7,
        bearing: 0,
        pitch: 0,
        padding: { top: 0, bottom: 0, left: 0, right: 0 },
      };
    }

    // Final fallback: center of world
    return {
      longitude: 0,
      latitude: 0,
      zoom: 2,
      bearing: 0,
      pitch: 0,
      padding: { top: 0, bottom: 0, left: 0, right: 0 },
    };
  };

  // Map view state
  const [viewState, setViewState] = useState<ViewState>(getInitialViewState());
  const previousViewStateRef = useRef<ViewState>(getInitialViewState());

  // Map context menu state
  const [mapContextMenu, setMapContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // Long-press state for mobile
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const isLongPressActiveRef = useRef(false);

  // Save view state to localStorage when it changes
  useEffect(() => {
    const saveTimeout = setTimeout(() => {
      localStorage.setItem(
        "map.viewState",
        JSON.stringify({
          longitude: viewState.longitude,
          latitude: viewState.latitude,
          zoom: viewState.zoom,
        }),
      );
    }, 1000); // Debounce saves by 1 second

    return () => clearTimeout(saveTimeout);
  }, [viewState.longitude, viewState.latitude, viewState.zoom]);

  // Get map style based on provider
  // biome-ignore lint/suspicious/noExplicitAny: MapLibre StyleSpecification type is complex
  const mapStyle = useMemo((): string | any => {
    const provider = mapSettings.provider;
    const providerConfig = getProviderConfig(provider);

    // For vector tile providers (OpenFreeMap), use the style URL directly
    if (providerConfig?.isVector) {
      mapLogger.debug("Using vector tile provider", {
        provider,
        url: providerConfig.url,
      });
      return providerConfig.url;
    }

    // For raster tile providers, create a minimal style JSON
    const tileUrl = getProviderTileUrl(provider, mapSettings.customTileUrl);

    if (!tileUrl) {
      mapLogger.warn(
        "No tile URL for provider, falling back to CARTO English",
        { provider },
      );
      return {
        version: 8,
        sources: {
          "raster-tiles": {
            type: "raster",
            tiles: [
              "https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
            ],
            tileSize: 256,
            attribution: providerConfig?.attribution || "",
          },
        },
        layers: [
          {
            id: "simple-tiles",
            type: "raster",
            source: "raster-tiles",
            minzoom: 0,
            maxzoom: 22,
          },
        ],
      };
    }

    mapLogger.info("Using raster tile provider", {
      provider,
      url: tileUrl,
      minZoom: providerConfig?.minZoom,
      maxZoom: providerConfig?.maxZoom,
      currentZoom: viewState.zoom,
    });

    // Check if this provider has strict zoom constraints (aviation charts)
    const hasZoomConstraints =
      providerConfig?.minZoom && providerConfig?.minZoom > 0;

    // For aviation charts: hybrid approach with base map + overlay
    // MapLibre GL doesn't support raster tile overzooming like OpenLayers does
    // So we show a base map everywhere and overlay charts only where they exist
    if (hasZoomConstraints) {
      mapLogger.info("Using hybrid base + overlay for aviation charts", {
        provider,
        chartMinZoom: providerConfig.minZoom,
        chartMaxZoom: providerConfig.maxZoom,
      });

      return {
        version: 8,
        sources: {
          "base-tiles": {
            type: "raster",
            tiles: [
              "https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
            ],
            tileSize: 256,
            attribution: 'Powered by <a href="https://carto.com">CARTO.com</a>',
          },
          "chart-tiles": {
            type: "raster",
            tiles: [tileUrl],
            tileSize: 256,
            attribution: providerConfig?.attribution || "",
          },
        },
        layers: [
          {
            id: "base-layer",
            type: "raster",
            source: "base-tiles",
            minzoom: 0,
            maxzoom: 22,
          },
          {
            id: "chart-layer",
            type: "raster",
            source: "chart-tiles",
            minzoom: providerConfig.minZoom,
            maxzoom: providerConfig.maxZoom,
          },
        ],
      };
    }

    // For all other raster providers, use simple single-layer style
    return {
      version: 8,
      sources: {
        "raster-tiles": {
          type: "raster",
          tiles: [tileUrl],
          tileSize: 256,
          attribution: providerConfig?.attribution || "",
        },
      },
      layers: [
        {
          id: "simple-tiles",
          type: "raster",
          source: "raster-tiles",
          minzoom: 0,
          maxzoom: 22,
        },
      ],
    };
  }, [mapSettings.provider, mapSettings.customTileUrl, viewState.zoom]);

  // Handle view state changes
  const handleMove = useCallback(
    (evt: ViewStateChangeEvent) => {
      // Check if zooming by detecting wheel events
      const isZooming = evt.originalEvent instanceof WheelEvent;

      // If following an aircraft and zooming, keep the old center (where aircraft is)
      if (followedAircraftHex && isZooming) {
        const lockedViewState = {
          ...evt.viewState,
          longitude: previousViewStateRef.current.longitude,
          latitude: previousViewStateRef.current.latitude,
        };
        setViewState(lockedViewState);
        onViewStateChange?.(lockedViewState);
        // Don't update ref during zoom - keep the locked position
      } else {
        setViewState(evt.viewState);
        onViewStateChange?.(evt.viewState);
        // Update ref with new position when not zooming
        previousViewStateRef.current = evt.viewState;
      }
    },
    [onViewStateChange, followedAircraftHex],
  );

  // Handle map load
  const handleLoad = useCallback(() => {
    mapLogger.info("MapLibre load event fired");
    onLoad?.();
  }, [onLoad]);

  // Handle map error
  const handleError = useCallback((evt: { error: Error }) => {
    mapLogger.error("MapLibre error event", { error: evt.error.message });
  }, []);

  // Handle map context menu close
  const handleMapContextMenuClose = useCallback(() => {
    setMapContextMenu(null);
  }, []);

  // Handle touch start for long-press
  const handleTouchStart = useCallback((event: React.TouchEvent) => {
    // Only handle single touch
    if (event.touches.length !== 1) return;

    const touch = event.touches[0];
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };
    isLongPressActiveRef.current = false;

    // Start long-press timer (500ms)
    longPressTimerRef.current = setTimeout(() => {
      if (touchStartPosRef.current) {
        isLongPressActiveRef.current = true;
        setMapContextMenu({
          x: touchStartPosRef.current.x,
          y: touchStartPosRef.current.y,
        });
      }
    }, 500);
  }, []);

  // Handle touch move - cancel long-press if finger moves too much
  const handleTouchMove = useCallback((event: React.TouchEvent) => {
    if (!touchStartPosRef.current || event.touches.length !== 1) return;

    const touch = event.touches[0];
    const deltaX = Math.abs(touch.clientX - touchStartPosRef.current.x);
    const deltaY = Math.abs(touch.clientY - touchStartPosRef.current.y);

    // Cancel if moved more than 10px
    if (deltaX > 10 || deltaY > 10) {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      touchStartPosRef.current = null;
      isLongPressActiveRef.current = false;
    }
  }, []);

  // Handle touch end - cancel long-press if finger lifted
  const handleTouchEnd = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    touchStartPosRef.current = null;
    isLongPressActiveRef.current = false;
  }, []);

  // Cleanup long-press timer on unmount
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  // Prevent text selection during long-press
  useEffect(() => {
    const preventSelection = (event: Event) => {
      if (isLongPressActiveRef.current || longPressTimerRef.current) {
        event.preventDefault();
      }
    };

    document.addEventListener("selectstart", preventSelection);
    document.addEventListener("contextmenu", preventSelection);

    return () => {
      document.removeEventListener("selectstart", preventSelection);
      document.removeEventListener("contextmenu", preventSelection);
    };
  }, []);

  // Handle unfollow from map context menu
  const handleUnfollowFromMap = useCallback(() => {
    if (onFollowAircraft) {
      onFollowAircraft(null);
    }
  }, [onFollowAircraft]);

  return (
    <div
      className={`map-container ${className}`}
      data-nexrad-visible={mapSettings.showNexrad}
      data-rainviewer-visible={mapSettings.showRainViewer}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      <MapLibreMap
        key={mapSettings.provider}
        ref={mapRef}
        {...viewState}
        onMove={handleMove}
        onLoad={handleLoad}
        onError={handleError}
        mapStyle={mapStyle}
        style={{ width: "100%", height: "100%" }}
        attributionControl={{}}
        maxZoom={20}
        minZoom={1}
        dragRotate={false}
        touchZoomRotate={{ around: "center" }}
        keyboard={true}
      >
        {/* Navigation controls (zoom, compass) */}
        <NavigationControl position="top-right" showCompass={false} />

        {/* Scale control */}
        <ScaleControl position="bottom-right" unit="nautical" />

        {/* Range rings (reception coverage) */}
        <RangeRings viewState={viewState} />

        {/* Station marker (ground receiver location) */}
        <StationMarker />

        {/* NEXRAD weather radar overlay (layer only) */}
        <NexradOverlay />

        {/* RainViewer weather radar overlay (layer only) */}
        <RainViewerOverlay />

        {/* OpenAIP aeronautical charts overlay */}
        <OpenAIPOverlay />

        {/* GeoJSON overlays (aviation zones, boundaries, etc.) */}
        <GeoJSONOverlays />

        {/* Aircraft markers */}
        <AircraftMarkers
          hoveredAircraftHex={hoveredAircraftHex}
          followedAircraftHex={followedAircraftHex}
          onFollowAircraft={onFollowAircraft}
          aircraft={aircraft}
        />
      </MapLibreMap>

      {/* Weather overlay timestamps rendered outside map for proper positioning */}
      <NexradOverlay renderTimestampOnly />
      <RainViewerOverlay renderTimestampOnly />

      {/* Map context menu */}
      {mapContextMenu && (
        <MapContextMenu
          x={mapContextMenu.x}
          y={mapContextMenu.y}
          isFollowingAircraft={!!followedAircraftHex}
          isPaused={isPaused}
          onClose={handleMapContextMenuClose}
          onUnfollowAircraft={handleUnfollowFromMap}
          onTogglePause={() => {
            onTogglePause?.();
            handleMapContextMenuClose();
          }}
        />
      )}
    </div>
  );
}
