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
  MapLayerMouseEvent,
} from "maplibre-gl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Layer, Popup, Source, useMap } from "react-map-gl/maplibre";
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
            popup={overlay.popup}
          />
        );
      })}
    </>
  );
}

interface HoverPopupState {
  lng: number;
  lat: number;
  title: string;
  subtitle?: string;
}

interface PopupConfig {
  titleProperty: string;
  subtitleProperty?: string;
}

/**
 * Single GeoJSON overlay layer renderer
 * Creates MapLibre Source and Layers for a single overlay:
 * - Line layer (LineString, MultiLineString, Polygon outlines)
 * - Fill layer (Polygon, MultiPolygon interiors only)
 * - Circle layer (Point, MultiPoint features only)
 *
 * When a popup config is provided, shows a hover popup with feature
 * properties on mousemove over the fill layer.
 */
function GeoJSONOverlayLayer({
  overlayId,
  path,
  color,
  opacity,
  popup,
}: {
  overlayId: string;
  path: string;
  color: string;
  opacity: number;
  popup?: PopupConfig;
}) {
  const { current: map } = useMap();
  const [hoverPopup, setHoverPopup] = useState<HoverPopupState | null>(null);

  // Register mousemove/mouseleave handlers on the fill layer when popup is configured.
  // We listen on the fill layer (not line) because fills cover the entire polygon area,
  // making it much easier to hover. mousemove is used instead of mouseenter so the popup
  // position and feature name update smoothly when crossing adjacent TRACON boundaries.
  const handleMouseMove = useCallback(
    (event: MapLayerMouseEvent) => {
      if (!popup) return;
      const feature = event.features?.[0];
      if (!feature?.properties) return;

      const title = (feature.properties[popup.titleProperty] as string) ?? "";

      // prefix is stored as an array in the GeoJSON (e.g. ["HMN"]).
      // MapLibre JSON-stringifies array properties when passing them through
      // layer events, so the value arrives as the string '["HMN"]' rather than
      // a real JS array. Attempt JSON.parse first, then fall back to String().
      const rawSubtitle = popup.subtitleProperty
        ? feature.properties[popup.subtitleProperty]
        : undefined;
      const subtitle: string | undefined = (() => {
        if (rawSubtitle === undefined || rawSubtitle === null) return undefined;
        try {
          const parsed: unknown = JSON.parse(rawSubtitle as string);
          if (Array.isArray(parsed)) {
            return parsed.map(String).join(", ");
          }
        } catch {
          // Not valid JSON — use value as-is
        }
        return String(rawSubtitle);
      })();

      setHoverPopup({
        lng: event.lngLat.lng,
        lat: event.lngLat.lat,
        title,
        subtitle,
      });
    },
    [popup],
  );

  const handleMouseLeave = useCallback(() => {
    setHoverPopup(null);
    if (map) {
      map.getCanvas().style.cursor = "";
    }
  }, [map]);

  useEffect(() => {
    if (!map || !popup) return;

    const fillLayerId = `${overlayId}-fill`;

    const onMouseMove = (event: MapLayerMouseEvent) => {
      map.getCanvas().style.cursor = "pointer";
      handleMouseMove(event);
    };

    map.on("mousemove", fillLayerId, onMouseMove);
    map.on("mouseleave", fillLayerId, handleMouseLeave);

    return () => {
      map.off("mousemove", fillLayerId, onMouseMove);
      map.off("mouseleave", fillLayerId, handleMouseLeave);
      // Clean up cursor and popup if the layer is removed while hovering
      map.getCanvas().style.cursor = "";
      setHoverPopup(null);
    };
  }, [map, overlayId, popup, handleMouseMove, handleMouseLeave]);

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
    <>
      <Source id={`${overlayId}-source`} {...source}>
        {/* Fill layer first (below lines) - Polygons only */}
        <Layer {...fillLayer} />
        {/* Line layer - LineStrings and Polygon outlines */}
        <Layer {...lineLayer} />
        {/* Circle layer - Points only */}
        <Layer {...circleLayer} />
      </Source>

      {/* Hover popup - rendered outside Source so it sits at map level */}
      {hoverPopup && popup && (
        <Popup
          longitude={hoverPopup.lng}
          latitude={hoverPopup.lat}
          closeButton={false}
          closeOnClick={false}
          anchor="bottom"
          offset={12}
        >
          <div className="geojson-popup">
            <span className="geojson-popup__label">
              {hoverPopup.subtitle
                ? `${hoverPopup.title}/${hoverPopup.subtitle}`
                : hoverPopup.title}
            </span>
          </div>
        </Popup>
      )}
    </>
  );
}
