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
import { useCallback, useEffect, useMemo, useState } from "react";
import { Layer, Source } from "react-map-gl/maplibre";
import { useSettingsStore } from "../../store/useSettingsStore";
import { mapLogger } from "../../utils/logger";

/**
 * RainViewer API Response Types
 */
interface RainViewerRadarFrame {
  time: number;
  path: string;
}

interface RainViewerAPIResponse {
  version: string;
  generated: number;
  host: string;
  radar: {
    past: RainViewerRadarFrame[];
    nowcast: RainViewerRadarFrame[];
  };
  satellite?: {
    infrared: RainViewerRadarFrame[];
  };
}

/**
 * RainViewerOverlay Component
 *
 * Displays RainViewer weather radar overlay on the map.
 * - Fetches latest radar imagery from RainViewer API
 * - Auto-refreshes every 2 minutes
 * - Shows timestamp of current radar data
 * - Configurable opacity and visibility
 *
 * Data source: https://www.rainviewer.com/api.html
 */
interface RainViewerOverlayProps {
  /** If true, only render the timestamp (not the map layer) */
  renderTimestampOnly?: boolean;
}

export function RainViewerOverlay({
  renderTimestampOnly = false,
}: RainViewerOverlayProps = {}) {
  const showRainViewer = useSettingsStore(
    (state) => state.settings.map.showRainViewer,
  );

  const [timestamp, setTimestamp] = useState<string>("");
  const [radarTime, setRadarTime] = useState<number | null>(null);

  // RainViewer configuration
  const OPACITY = 0.575;
  const REFRESH_INTERVAL = 2 * 60 * 1000; // 2 minutes in milliseconds
  const MAX_ZOOM = 7;

  /**
   * Fetch latest radar frame from RainViewer API
   */
  const fetchLatestRadar = useCallback(async (): Promise<number | null> => {
    try {
      const response = await fetch(
        "https://api.rainviewer.com/public/weather-maps.json",
        { credentials: "omit" },
      );
      const data: RainViewerAPIResponse = await response.json();

      if (data.radar?.past && data.radar.past.length > 0) {
        // Get the most recent radar frame
        const latestFrame = data.radar.past[data.radar.past.length - 1];
        mapLogger.debug("RainViewer radar frame fetched", {
          time: latestFrame.time,
          frameCount: data.radar.past.length,
        });
        return latestFrame.time;
      }

      mapLogger.warn("No radar frames available from RainViewer API");
      return null;
    } catch (error) {
      mapLogger.error("Failed to fetch RainViewer radar data", {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }, []);

  /**
   * Refresh radar data
   */
  const refreshRadar = useCallback(async () => {
    const time = await fetchLatestRadar();
    if (time) {
      setRadarTime(time);
      setTimestamp(new Date().toLocaleTimeString());
      mapLogger.info("RainViewer radar refreshed", { radarTime: time });
    }
  }, [fetchLatestRadar]);

  // RainViewer raster source (regenerated when radarTime changes)
  const rainViewerSource: RasterSourceSpecification | null = useMemo(() => {
    if (!radarTime) return null;

    const tileUrl = `https://tilecache.rainviewer.com/v2/radar/${radarTime}/512/{z}/{x}/{y}/6/1_1.png`;

    return {
      type: "raster",
      tiles: [tileUrl],
      tileSize: 256,
      maxzoom: MAX_ZOOM,
      attribution:
        '<a href="https://www.rainviewer.com/api.html">RainViewer.com</a>',
    };
  }, [radarTime]);

  // RainViewer raster layer configuration
  const rainViewerLayer: RasterLayerSpecification = useMemo(
    () => ({
      id: "rainviewer-layer",
      type: "raster",
      source: "rainviewer-source",
      paint: {
        "raster-opacity": OPACITY,
        "raster-fade-duration": 300,
      },
      layout: {
        visibility: showRainViewer ? "visible" : "none",
      },
    }),
    [showRainViewer],
  );

  // Fetch initial radar data when overlay is enabled
  useEffect(() => {
    if (showRainViewer && !radarTime) {
      refreshRadar();
    }
  }, [showRainViewer, radarTime, refreshRadar]);

  // Auto-refresh radar tiles every 2 minutes when enabled
  useEffect(() => {
    if (!showRainViewer) return;

    const intervalId = setInterval(() => {
      refreshRadar();
    }, REFRESH_INTERVAL);

    return () => clearInterval(intervalId);
  }, [showRainViewer, refreshRadar]);

  // Don't render if not shown or no radar data yet
  if (!showRainViewer || !rainViewerSource) {
    return null;
  }

  // If renderTimestampOnly is true, only render the timestamp
  if (renderTimestampOnly) {
    return timestamp ? (
      <div className="rainviewer-timestamp">
        <span className="rainviewer-timestamp__label">RainViewer:</span>
        <span className="rainviewer-timestamp__time">{timestamp}</span>
      </div>
    ) : null;
  }

  // Otherwise, render the map layer (without timestamp)
  return (
    <Source id="rainviewer-source" {...rainViewerSource}>
      <Layer {...rainViewerLayer} />
    </Source>
  );
}
