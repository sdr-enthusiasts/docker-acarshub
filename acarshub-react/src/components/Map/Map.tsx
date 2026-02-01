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

import { useCallback, useEffect, useMemo, useState } from "react";
import type { MapRef, ViewState } from "react-map-gl/maplibre";
import MapLibreMap, {
  NavigationControl,
  ScaleControl,
} from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { useAppStore } from "../../store/useAppStore";
import { useSettingsStore, useTheme } from "../../store/useSettingsStore";
import latteStyle from "../../styles/map-styles/catppuccin-latte.json";
import mochaStyle from "../../styles/map-styles/catppuccin-mocha.json";
import { AircraftMarkers } from "./AircraftMarkers";
import { NexradOverlay } from "./NexradOverlay";
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
}

/**
 * Map Component
 *
 * High-performance map using MapLibre GL JS with Catppuccin theming.
 * Supports multiple tile providers (Protomaps by default, Maptiler optional).
 */
export function MapComponent({
  className = "",
  mapRef,
  onLoad,
  onViewStateChange,
  hoveredAircraftHex,
}: MapComponentProps) {
  const theme = useTheme();
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
  const [viewState, setViewState] = useState<ViewState>(getInitialViewState);

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

  // Get map style based on theme and provider
  const mapStyle = useMemo(() => {
    const provider = mapSettings.provider;

    if (provider === "maptiler" && mapSettings.maptilerApiKey) {
      // Maptiler style URLs
      const baseUrl = "https://api.maptiler.com/maps";
      const apiKey = mapSettings.maptilerApiKey;
      const styleId = theme === "mocha" ? "streets-v2-dark" : "streets-v2";
      return `${baseUrl}/${styleId}/style.json?key=${apiKey}`;
    }

    // Protomaps with Catppuccin theming (default)
    // Cast to unknown first to bypass TypeScript's strict type checking
    return theme === "mocha"
      ? (mochaStyle as unknown as string)
      : (latteStyle as unknown as string);
  }, [theme, mapSettings.provider, mapSettings.maptilerApiKey]);

  // Handle view state changes
  const handleMove = useCallback(
    (evt: { viewState: ViewState }) => {
      setViewState(evt.viewState);
      onViewStateChange?.(evt.viewState);
    },
    [onViewStateChange],
  );

  // Handle map load
  const handleLoad = useCallback(() => {
    onLoad?.();
  }, [onLoad]);

  return (
    <div className={`map-container ${className}`}>
      <MapLibreMap
        ref={mapRef}
        {...viewState}
        onMove={handleMove}
        onLoad={handleLoad}
        mapStyle={mapStyle}
        style={{ width: "100%", height: "100%" }}
        attributionControl={{}}
        maxZoom={18}
        minZoom={2}
        dragRotate={false}
        touchZoomRotate={false}
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

        {/* NEXRAD weather radar overlay */}
        <NexradOverlay />

        {/* Aircraft markers */}
        <AircraftMarkers hoveredAircraftHex={hoveredAircraftHex} />
      </MapLibreMap>

      {/* NEXRAD overlay renders its own timestamp outside the map */}
    </div>
  );
}
