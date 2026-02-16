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
  CircleLayerSpecification,
  FillLayerSpecification,
  GeoJSONSourceSpecification,
  LineLayerSpecification,
} from "maplibre-gl";
import { useMemo } from "react";
import { Layer, Source } from "react-map-gl/maplibre";
import { getOverlayById } from "../../config/geojsonOverlays";
import { useSettingsStore } from "../../store/useSettingsStore";
import { resolveBasePath } from "../../utils/pathUtils";

// Stable empty array to prevent re-renders
const EMPTY_ARRAY: string[] = [];

/**
 * GeoJSONOverlays Component
 *
 * Renders enabled GeoJSON overlays on the map (aviation zones, boundaries, etc.).
 * - MapLibre fetches GeoJSON files directly via URL (no manual fetch)
 * - Supports LineString, Polygon, and Point geometry types
 * - Applies custom colors and opacity from overlay configuration
 * - Uses geometry type filters to render only appropriate layers
 *
 * Similar to NexradOverlay but for GeoJSON layers.
 */
export function GeoJSONOverlays() {
  const enabledOverlayIds = useSettingsStore(
    (state) => state.settings?.map?.enabledGeoJSONOverlays || EMPTY_ARRAY,
  );

  return (
    <>
      {enabledOverlayIds.map((overlayId) => {
        const overlay = getOverlayById(overlayId);
        if (!overlay) {
          return null;
        }

        return (
          <GeoJSONOverlayLayer
            key={overlayId}
            overlayId={overlayId}
            path={overlay.path}
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
 * Creates MapLibre Source and Layers for a single overlay:
 * - Line layer (LineString, MultiLineString, Polygon outlines)
 * - Fill layer (Polygon, MultiPolygon interiors only)
 * - Circle layer (Point, MultiPoint features only)
 */
function GeoJSONOverlayLayer({
  overlayId,
  path,
  color,
  opacity,
}: {
  overlayId: string;
  path: string;
  color: string;
  opacity: number;
}) {
  // GeoJSON source - MapLibre fetches the URL automatically
  // Resolve path relative to BASE_URL for subpath deployments
  const source: GeoJSONSourceSpecification = useMemo(
    () => ({
      type: "geojson",
      data: resolveBasePath(path), // Resolve relative to Vite's BASE_URL
    }),
    [path],
  );

  // Line layer (for LineString and Polygon outlines)
  const lineLayer: LineLayerSpecification = useMemo(
    () => ({
      id: `${overlayId}-line`,
      type: "line",
      source: `${overlayId}-source`,
      filter: [
        "in",
        ["geometry-type"],
        [
          "literal",
          ["LineString", "MultiLineString", "Polygon", "MultiPolygon"],
        ],
      ],
      paint: {
        "line-color": color,
        "line-width": 2,
        "line-opacity": opacity,
      },
    }),
    [overlayId, color, opacity],
  );

  // Fill layer (for Polygon interiors only - not LineString!)
  const fillLayer: FillLayerSpecification = useMemo(
    () => ({
      id: `${overlayId}-fill`,
      type: "fill",
      source: `${overlayId}-source`,
      filter: [
        "in",
        ["geometry-type"],
        ["literal", ["Polygon", "MultiPolygon"]],
      ],
      paint: {
        "fill-color": color,
        "fill-opacity": opacity * 0.3, // Lighter fill (30% of line opacity)
      },
    }),
    [overlayId, color, opacity],
  );

  // Circle layer (for Point features)
  const circleLayer: CircleLayerSpecification = useMemo(
    () => ({
      id: `${overlayId}-circle`,
      type: "circle",
      source: `${overlayId}-source`,
      filter: ["in", ["geometry-type"], ["literal", ["Point", "MultiPoint"]]],
      paint: {
        "circle-color": color,
        "circle-radius": 4,
        "circle-opacity": opacity,
        "circle-stroke-color": color,
        "circle-stroke-width": 1,
        "circle-stroke-opacity": opacity,
      },
    }),
    [overlayId, color, opacity],
  );

  return (
    <Source id={`${overlayId}-source`} {...source}>
      {/* Fill layer first (below lines) - Polygons only */}
      <Layer {...fillLayer} />
      {/* Line layer - LineStrings and Polygon outlines */}
      <Layer {...lineLayer} />
      {/* Circle layer - Points only */}
      <Layer {...circleLayer} />
    </Source>
  );
}
