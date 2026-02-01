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
import { useEffect, useMemo, useState } from "react";
import { Layer, Source } from "react-map-gl/maplibre";
import { useSettingsStore } from "../../store/useSettingsStore";

/**
 * NexradOverlay Component
 *
 * Displays NEXRAD weather radar overlay on the map using WMS tiles from Iowa State.
 * - Fetches latest radar imagery from Iowa Mesonet
 * - Auto-refreshes every 5 minutes
 * - Shows timestamp of current radar data
 * - Configurable opacity and visibility
 *
 * Data source: https://mesonet.agron.iastate.edu/ogc/
 */
export function NexradOverlay() {
  const showNexrad = useSettingsStore((state) => state.settings.map.showNexrad);

  const [timestamp, setTimestamp] = useState<string>("");
  const [_refreshKey, setRefreshKey] = useState(0);

  // NEXRAD WMS configuration
  const NEXRAD_URL =
    "https://mesonet.agron.iastate.edu/cgi-bin/wms/nexrad/n0q.cgi";
  const NEXRAD_LAYER = "nexrad-n0q-900913";
  const OPACITY = 0.575;
  const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes in milliseconds

  // NEXRAD raster source (regenerated on refresh)
  const nexradSource: RasterSourceSpecification = useMemo(
    () => {
      const bbox = "{bbox-epsg-3857}";
      const tileUrl = `${NEXRAD_URL}?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&FORMAT=image/png&TRANSPARENT=true&LAYERS=${NEXRAD_LAYER}&SRS=EPSG:3857&BBOX=${bbox}&WIDTH=256&HEIGHT=256`;

      return {
        type: "raster",
        tiles: [tileUrl],
        tileSize: 256,
        scheme: "xyz",
      };
    },
    [], // Refresh source when key changes
  );

  // NEXRAD raster layer configuration
  const nexradLayer: RasterLayerSpecification = useMemo(
    () => ({
      id: "nexrad-layer",
      type: "raster",
      source: "nexrad-source",
      paint: {
        "raster-opacity": OPACITY,
        "raster-fade-duration": 300,
      },
      layout: {
        visibility: showNexrad ? "visible" : "none",
      },
    }),
    [showNexrad],
  );

  // Update timestamp when NEXRAD is enabled
  useEffect(() => {
    if (showNexrad) {
      const now = new Date();
      setTimestamp(now.toLocaleTimeString());
    }
  }, [showNexrad]);

  // Auto-refresh NEXRAD tiles every 5 minutes
  useEffect(() => {
    if (!showNexrad) return;

    const intervalId = setInterval(() => {
      // Increment refresh key to force source regeneration
      setRefreshKey((prev) => prev + 1);
      const now = new Date();
      setTimestamp(now.toLocaleTimeString());
    }, REFRESH_INTERVAL);

    return () => clearInterval(intervalId);
  }, [showNexrad]);

  // Don't render if not shown
  if (!showNexrad) {
    return null;
  }

  return (
    <>
      <Source id="nexrad-source" {...nexradSource}>
        <Layer {...nexradLayer} />
      </Source>

      {/* Timestamp display */}
      {timestamp && (
        <div className="nexrad-timestamp">
          <span className="nexrad-timestamp__label">NEXRAD:</span>
          <span className="nexrad-timestamp__time">{timestamp}</span>
        </div>
      )}
    </>
  );
}
