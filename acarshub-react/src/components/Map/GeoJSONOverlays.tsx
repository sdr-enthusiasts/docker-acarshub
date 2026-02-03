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

import type {
  FillLayerSpecification,
  GeoJSONSourceSpecification,
  LineLayerSpecification,
} from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";
import { Layer, Source } from "react-map-gl/maplibre";
import { getOverlayById } from "../../config/geojsonOverlays";
import { useSettingsStore } from "../../store/useSettingsStore";
import { mapLogger } from "../../utils/logger";

/**
 * GeoJSONOverlays Component
 *
 * Renders enabled GeoJSON overlays on the map (aviation zones, boundaries, etc.).
 * - Lazy loads GeoJSON files only when enabled
 * - Supports LineString and Polygon geometry types
 * - Applies custom colors and opacity from overlay configuration
 * - Handles loading states and fetch errors gracefully
 *
 * Similar to NexradOverlay but supports multiple independent layers.
 */
export function GeoJSONOverlays() {
  const enabledOverlayIds = useSettingsStore(
    (state) => state.settings.map.enabledGeoJSONOverlays || [],
  );

  // Track loaded GeoJSON data and errors
  const [loadedData, setLoadedData] = useState<
    Record<string, GeoJSON.FeatureCollection>
  >({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Track which overlays we've attempted to fetch to prevent duplicate fetches
  const fetchedRef = useRef<Set<string>>(new Set());

  // Fetch GeoJSON data when overlays are enabled
  useEffect(() => {
    for (const overlayId of enabledOverlayIds) {
      // Skip if already fetched (loading or loaded or errored)
      if (fetchedRef.current.has(overlayId)) {
        continue;
      }

      const overlay = getOverlayById(overlayId);
      if (!overlay) {
        mapLogger.warn("Unknown overlay ID", { overlayId });
        continue;
      }

      // Mark as fetched immediately to prevent duplicate requests
      fetchedRef.current.add(overlayId);

      mapLogger.debug("Fetching GeoJSON overlay", {
        id: overlay.id,
        path: overlay.path,
      });

      // Fetch GeoJSON data
      fetch(overlay.path)
        .then((response) => {
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          return response.json();
        })
        .then((data: GeoJSON.FeatureCollection) => {
          mapLogger.info("GeoJSON overlay loaded", {
            id: overlay.id,
            features: data.features?.length || 0,
          });
          setLoadedData((prev) => ({ ...prev, [overlayId]: data }));
        })
        .catch((error) => {
          const errorMsg =
            error instanceof Error ? error.message : String(error);
          mapLogger.error("Failed to load GeoJSON overlay", {
            id: overlay.id,
            path: overlay.path,
            error: errorMsg,
          });
          setErrors((prev) => ({ ...prev, [overlayId]: errorMsg }));
        });
    }

    // Cleanup disabled overlays
    const currentIds = new Set(enabledOverlayIds);
    setLoadedData((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const id of Object.keys(next)) {
        if (!currentIds.has(id)) {
          delete next[id];
          fetchedRef.current.delete(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    setErrors((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const id of Object.keys(next)) {
        if (!currentIds.has(id)) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [enabledOverlayIds]);

  // Render each enabled overlay
  return (
    <>
      {enabledOverlayIds.map((overlayId) => {
        const overlay = getOverlayById(overlayId);
        const data = loadedData[overlayId];
        const error = errors[overlayId];

        // Skip if overlay not found
        if (!overlay) {
          return null;
        }

        // Skip if still loading or errored
        if (!data || error) {
          return null;
        }

        return (
          <GeoJSONOverlayLayer
            key={overlayId}
            overlayId={overlayId}
            data={data}
            color={overlay.color || "#00ff00"}
            opacity={overlay.opacity || 0.7}
          />
        );
      })}
    </>
  );
}

/**
 * Single GeoJSON overlay layer renderer
 * Creates MapLibre Source and Layers (line + fill) for a single overlay
 */
function GeoJSONOverlayLayer({
  overlayId,
  data,
  color,
  opacity,
}: {
  overlayId: string;
  data: GeoJSON.FeatureCollection;
  color: string;
  opacity: number;
}) {
  // GeoJSON source
  const source: GeoJSONSourceSpecification = useMemo(
    () => ({
      type: "geojson",
      data,
    }),
    [data],
  );

  // Line layer (for LineString and Polygon outlines)
  const lineLayer: LineLayerSpecification = useMemo(
    () => ({
      id: `${overlayId}-line`,
      type: "line",
      source: `${overlayId}-source`,
      paint: {
        "line-color": color,
        "line-width": 2,
        "line-opacity": opacity,
      },
    }),
    [overlayId, color, opacity],
  );

  // Fill layer (for Polygon interiors)
  const fillLayer: FillLayerSpecification = useMemo(
    () => ({
      id: `${overlayId}-fill`,
      type: "fill",
      source: `${overlayId}-source`,
      paint: {
        "fill-color": color,
        "fill-opacity": opacity * 0.3, // Lighter fill (30% of line opacity)
      },
    }),
    [overlayId, color, opacity],
  );

  return (
    <Source id={`${overlayId}-source`} {...source}>
      {/* Fill layer first (below lines) */}
      <Layer {...fillLayer} />
      {/* Line layer on top */}
      <Layer {...lineLayer} />
    </Source>
  );
}
