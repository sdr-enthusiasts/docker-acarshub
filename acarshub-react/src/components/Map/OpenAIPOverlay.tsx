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
  RasterLayerSpecification,
  RasterSourceSpecification,
} from "maplibre-gl";
import { useMemo } from "react";
import { Layer, Source } from "react-map-gl/maplibre";
import { useSettingsStore } from "../../store/useSettingsStore";

/**
 * OpenAIPOverlay Component
 *
 * Displays OpenAIP aeronautical charts overlay on the map.
 * - Shows airports, airspaces, navaids, and other aviation data
 * - TMS tiles from map.adsbexchange.com (OpenAIP data)
 * - Max zoom level 12 (chart data not available beyond this)
 * - Configurable opacity and visibility
 *
 * Data source: openAIP.net
 */
export function OpenAIPOverlay() {
  const showOpenAIP = useSettingsStore(
    (state) => state.settings.map.showOpenAIP,
  );

  // OpenAIP TMS configuration
  const OPENAIP_URL =
    "https://map.adsbexchange.com/mapproxy/tiles/1.0.0/openaip/ul_grid/{z}/{x}/{y}.png";
  const OPACITY = 0.8;
  const MAX_ZOOM = 12;

  // OpenAIP raster source
  const openAIPSource: RasterSourceSpecification = useMemo(
    () => ({
      type: "raster",
      tiles: [OPENAIP_URL],
      tileSize: 256,
      maxzoom: MAX_ZOOM,
      attribution: "openAIP.net",
    }),
    [],
  );

  // OpenAIP raster layer configuration
  const openAIPLayer: RasterLayerSpecification = useMemo(
    () => ({
      id: "openaip-layer",
      type: "raster",
      source: "openaip-source",
      paint: {
        "raster-opacity": OPACITY,
        "raster-fade-duration": 300,
      },
      layout: {
        visibility: showOpenAIP ? "visible" : "none",
      },
      maxzoom: MAX_ZOOM + 1, // Allow display up to zoom 13
    }),
    [showOpenAIP],
  );

  // Don't render if not shown
  if (!showOpenAIP) {
    return null;
  }

  return (
    <Source id="openaip-source" {...openAIPSource}>
      <Layer {...openAIPLayer} />
    </Source>
  );
}
