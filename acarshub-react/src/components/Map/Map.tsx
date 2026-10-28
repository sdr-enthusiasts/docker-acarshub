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

// Vite's `?worker&url` query bundles maplibre-gl-worker.mjs (plus its
// sibling maplibre-gl-shared.mjs chunk) into a self-contained, hashed
// worker asset and gives us its final URL. maplibre-gl v6 ships as
// ESM-only and no longer auto-detects the worker location for bundled
// (non-CDN) consumers — see the v5-to-v6 migration guide's "setWorkerUrl()
// is bundler-only" section. Without this, the Map requests a worker from
// a guessed path that doesn't match Vite's hashed output; the dev/preview
// server's SPA fallback serves index.html for that 404 with a 200 status,
// so the browser happily constructs a worker with HTML as its source,
// which silently fails to ever produce tile/source data — the map then
// never fires its `load` event and hangs until the 10s fallback timeout
// in useMapLifecycle.ts force-completes it. Do NOT switch to plain
// `?url`: it emits the worker file without its sibling shared chunk, and
// the worker fails on its first import in production builds.
//
// Pass this to <MapLibreMap workerUrl={...}> as a component PROP (a
// @vis.gl/react-maplibre GlobalSettings field threaded through its
// internal setGlobals() before the underlying maplibre-gl Map is
// constructed) — NOT via importing and calling maplibre-gl's own
// module-level setWorkerUrl() ourselves. That was tried first and
// caused a worse regression ("Cannot read properties of undefined
// (reading 'Map')", canvas never mounting in ANY browser): the call
// site had no consumer of its return value, so Vite/rolldown's
// tree-shaking silently dropped the call as a dead, side-effect-free
// import — it never actually ran.
import type {
  RasterLayerSpecification,
  RasterSourceSpecification,
  StyleSpecification,
} from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  MapRef,
  ViewState,
  ViewStateChangeEvent,
} from "react-map-gl/maplibre";
import MapLibreMap, {
  Layer,
  NavigationControl,
  ScaleControl,
  Source,
} from "react-map-gl/maplibre";
// maplibre-gl's base stylesheet is loaded via a dynamic import alongside
// the `LiveMapPage` lazy chunk in App.tsx (PERF-BUNDLE Phase B — see
// agent-docs/REMEDIATION_PLAN.md §15), not statically here. A static
// top-level import here would still land in the "map" vendor chunk's CSS
// asset, which Vite links unconditionally in the root index.html
// regardless of route (a ~10KB gzip render-blocking stylesheet on every
// page, including ones that never touch the map). Do NOT reintroduce a
// static import of this CSS file.
import {
  getProviderConfig,
  getProviderTileUrl,
  getThemeDefaultProvider,
  resolveEffectiveProvider,
} from "../../config/mapProviders";
import { useAppStore } from "../../store/useAppStore";
import { useSettingsStore, useTheme } from "../../store/useSettingsStore";
import type { MapProviderConfig } from "../../types";
import type { PairedAircraft } from "../../utils/aircraftPairing";
import { mapLogger } from "../../utils/logger";
import type { ViewportBounds } from "./AircraftMarkers";
import { AircraftMarkers } from "./AircraftMarkers";
import { GeoJSONOverlays } from "./GeoJSONOverlays";
import { HeyWhatsThatOverlay } from "./HeyWhatsThatOverlay";
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
  /**
   * Callback fired whenever the map viewport changes.
   * Provides exact (unbuffered) bounds for the sidebar "Visible Only" filter.
   */
  onViewportBoundsChange?: (bounds: ViewportBounds | null) => void;
}

/** Aviation chart raster drawn above the theme default base map */
interface ChartOverlay {
  source: RasterSourceSpecification;
  layer: RasterLayerSpecification;
}

const CHART_SOURCE_ID = "chart-tiles";
const CHART_LAYER_ID = "chart-layer";

/**
 * Aviation charts (VFR/IFR) only have tiles within a narrow zoom band, and
 * MapLibre cannot overzoom raster tiles the way OpenLayers does, so they are
 * shown as an overlay on a base map rather than as the base map itself.
 */
function isZoomConstrainedChart(
  providerConfig: MapProviderConfig | undefined,
): boolean {
  return (providerConfig?.minZoom ?? 0) > 0;
}

/**
 * Map Component
 *
 * High-performance map using MapLibre GL JS.
 * Supports multiple tile providers: raster and vector (OpenFreeMap) base maps,
 * aviation charts over the theme default base map, and custom URLs.
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
  onViewportBoundsChange,
}: MapComponentProps) {
  const decoders = useAppStore((state) => state.decoders);
  const mapSettings = useSettingsStore((state) => state.settings.map);
  const theme = useTheme();

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

  // The provider actually rendered: a provider whose required API key is
  // missing (CARTO) resolves to the theme default. The stored choice is kept.
  const effectiveProvider = resolveEffectiveProvider(mapSettings, theme);

  // Provider-specific style, or null when the base map must be the theme
  // default (no usable URL, or an aviation chart that needs a base beneath
  // it). `theme` is deliberately NOT a dependency here so raster style
  // objects keep their identity across theme changes; `effectiveProvider`
  // only follows the theme while falling back to the theme default.
  const providerStyle = useMemo((): string | StyleSpecification | null => {
    // In E2E mode, return a minimal inline style with no external sources.
    // MapLibre can parse and load this instantly, firing onLoad reliably
    // without depending on external CDN tile providers which are unavailable
    // inside the Docker E2E container.  The accessibility scan excludes
    // .maplibregl-map so an empty canvas is fine for those tests.
    if (import.meta.env.VITE_E2E) {
      return { version: 8, sources: {}, layers: [] };
    }

    const provider = effectiveProvider;
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
    const tileUrl = getProviderTileUrl(provider, mapSettings.customTileUrl, {
      carto: mapSettings.cartoApiKey,
    });

    if (!tileUrl) {
      mapLogger.warn(
        "No tile URL for provider, falling back to theme default base map",
        { provider },
      );
      return null;
    }

    if (isZoomConstrainedChart(providerConfig)) {
      mapLogger.info("Using theme default base map beneath aviation chart", {
        provider,
        chartMinZoom: providerConfig?.minZoom,
        chartMaxZoom: providerConfig?.maxZoom,
      });
      return null;
    }

    mapLogger.info("Using raster tile provider", {
      provider,
      // Unkeyed template where one exists, so API keys never reach the
      // (optionally persisted) logs.
      url: providerConfig?.url || tileUrl,
      minZoom: providerConfig?.minZoom,
      maxZoom: providerConfig?.maxZoom,
    });

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
  }, [effectiveProvider, mapSettings.customTileUrl, mapSettings.cartoApiKey]);

  const mapStyle = useMemo((): string | StyleSpecification => {
    if (providerStyle !== null) {
      return providerStyle;
    }

    const themeProvider = getThemeDefaultProvider(theme);
    const themeStyleUrl = getProviderConfig(themeProvider)?.url ?? "";
    mapLogger.debug("Using theme default base map", {
      theme,
      provider: themeProvider,
      url: themeStyleUrl,
    });
    return themeStyleUrl;
  }, [providerStyle, theme]);

  // Aviation chart raster, rendered as a child <Source>/<Layer> over the
  // theme default base map. Restricting the layer to the chart's zoom band
  // leaves the base map visible wherever the chart has no tiles.
  const chartOverlay = useMemo((): ChartOverlay | null => {
    if (import.meta.env.VITE_E2E) {
      return null;
    }

    const providerConfig = getProviderConfig(effectiveProvider);
    if (!providerConfig || !isZoomConstrainedChart(providerConfig)) {
      return null;
    }

    const tileUrl = getProviderTileUrl(effectiveProvider);
    if (!tileUrl) {
      return null;
    }

    return {
      source: {
        type: "raster",
        tiles: [tileUrl],
        tileSize: 256,
        minzoom: providerConfig.minZoom,
        maxzoom: providerConfig.maxZoom,
        attribution: providerConfig.attribution,
      },
      layer: {
        id: CHART_LAYER_ID,
        type: "raster",
        source: CHART_SOURCE_ID,
        minzoom: providerConfig.minZoom,
        maxzoom: providerConfig.maxZoom,
      },
    };
  }, [effectiveProvider]);

  // The map remounts on provider change. A theme-derived base must ALSO
  // remount on theme change: swapping the style URL in place makes MapLibre
  // drop every runtime-added layer, and react-map-gl re-adds them from
  // per-component `styledata` timers in no guaranteed order (none use
  // `beforeId`), so the chart could end up drawn above the overlays.
  const mapKey =
    providerStyle === null
      ? `${effectiveProvider}:${theme}`
      : effectiveProvider;

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
        key={mapKey}
        ref={mapRef}
        {...viewState}
        onMove={handleMove}
        onLoad={handleLoad}
        onError={handleError}
        mapStyle={mapStyle}
        workerUrl={workerUrl}
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

        {/* Aviation chart — first overlay so everything below draws above it */}
        {chartOverlay && (
          <Source id={CHART_SOURCE_ID} {...chartOverlay.source}>
            <Layer {...chartOverlay.layer} />
          </Source>
        )}

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

        {/* Hey What's That antenna coverage outline */}
        <HeyWhatsThatOverlay />

        {/* Aircraft markers */}
        <AircraftMarkers
          hoveredAircraftHex={hoveredAircraftHex}
          followedAircraftHex={followedAircraftHex}
          onFollowAircraft={onFollowAircraft}
          aircraft={aircraft}
          onViewportBoundsChange={onViewportBoundsChange}
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
