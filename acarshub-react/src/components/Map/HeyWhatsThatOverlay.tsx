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

import { useMemo } from "react";
import { Layer, Source } from "react-map-gl/maplibre";
import { useAppStore } from "../../store/useAppStore";
import { useSettingsStore, useTheme } from "../../store/useSettingsStore";
import { resolvePathOrUrl } from "../../utils/pathUtils";

// Catppuccin-themed colors for each altitude ring.
// Rings are ordered by altitude (lowest first) so index 0 is the closest-in
// coverage and index N-1 is the widest.  We cycle through the palette if the
// user has requested more rings than we have colour slots.
const RING_COLORS = {
  mocha: [
    "#a6e3a1", // green   – lowest altitude
    "#89b4fa", // blue
    "#fab387", // peach
    "#f38ba8", // red
    "#cba6f7", // mauve
    "#89dceb", // sky
  ],
  latte: [
    "#40a02b", // green
    "#1e66f5", // blue
    "#fe640b", // peach
    "#d20f39", // red
    "#8839ef", // mauve
    "#04a5e5", // sky
  ],
} as const;

/**
 * HeyWhatsThatOverlay Component
 *
 * Renders the antenna coverage outline(s) fetched from heywhatsthat.com on
 * the live map.  One line ring is drawn per altitude requested in the
 * `HEYWHATSTHAT_ALTS` environment variable (default: 10,000 ft and 30,000 ft).
 *
 * The GeoJSON is fetched by MapLibre directly from the backend endpoint
 * `/data/heywhatsthat.geojson?v=<configHash>`.  The `?v=` query parameter
 * is a cache-bust token derived from the configured token + altitudes; it
 * changes whenever the operator changes either value, forcing browsers to
 * discard any cached copy.
 *
 * Visibility:
 * - Feature is only active when the backend has a valid HWT token configured
 *   (indicated by `decoders.adsb.heywhatsthat_url` being non-empty).
 * - The user can toggle display via the map controls button; the preference
 *   is persisted in the settings store (`showHeyWhatsThat`).
 *
 * Implementation notes:
 * - Each altitude ring in the GeoJSON FeatureCollection is rendered as a
 *   separate Layer so that distinct per-ring colours can be applied via
 *   MapLibre data-driven styling with a `match` expression on `ring_index`.
 * - A label layer shows the altitude string at the northernmost point of
 *   each ring (the first coordinate in the exterior ring, which HeyWhatsThat
 *   typically places at the top of the coverage area).
 */
export function HeyWhatsThatOverlay() {
  const decoders = useAppStore((state) => state.decoders);
  const settings = useSettingsStore((state) => state.settings);
  const theme = useTheme();

  const hwtUrl = decoders?.adsb?.heywhatsthat_url;
  const showHeyWhatsThat = settings.map.showHeyWhatsThat;

  // Resolve URL for MapLibre (handles BASE_URL subpath deployments and
  // passes absolute URLs through unchanged).
  const resolvedUrl = useMemo(() => {
    if (!hwtUrl) return null;
    return resolvePathOrUrl(hwtUrl);
  }, [hwtUrl]);

  // Build per-ring colour arrays for use in MapLibre `match` expressions.
  // We derive the expected ring indices from the URL: the GeoJSON is always
  // produced in the same ring order as the HEYWHATSTHAT_ALTS list.
  // Since we don't know the exact count client-side, we produce a palette
  // deep enough for all rings.  MapLibre uses the fallback colour for any
  // ring_index not explicitly listed.
  const palette = RING_COLORS[theme];

  // Build a MapLibre `match` expression: ["match", ["get", "ring_index"], 0, color0, 1, color1, ..., fallback]
  const lineColorExpression = useMemo((): string[] => {
    const expr: (string | number | string[])[] = [
      "match",
      ["get", "ring_index"],
    ];
    palette.forEach((color, index) => {
      expr.push(index);
      expr.push(color);
    });
    // Fallback colour (same as first ring — cycles)
    expr.push(palette[0]);

    return expr as string[];
  }, [palette]); // palette is always 6 elements (RING_COLORS has fixed tuple types)

  // Text colour and halo for labels
  const textColor = theme === "mocha" ? "#cdd6f4" : "#4c4f69";
  const textHaloColor = theme === "mocha" ? "#1e1e2e" : "#eff1f5";

  // Don't render if:
  // - backend hasn't provided a URL (HWT not configured)
  // - user has toggled it off
  if (!resolvedUrl || !showHeyWhatsThat) {
    return null;
  }

  return (
    <Source id="heywhatsthat-coverage" type="geojson" data={resolvedUrl}>
      {/* Coverage outline rings — one coloured line per altitude ring */}
      <Layer
        id="heywhatsthat-coverage-line"
        type="line"
        paint={{
          // biome-ignore lint/suspicious/noExplicitAny: MapLibre expression type is complex
          "line-color": lineColorExpression as any,
          "line-width": 2,
          "line-opacity": 0.85,
          "line-dasharray": [6, 3],
        }}
      />

      {/* Altitude labels at the first point of each ring's exterior */}
      <Layer
        id="heywhatsthat-coverage-labels"
        type="symbol"
        filter={["==", ["geometry-type"], "Polygon"]}
        layout={{
          "text-field": ["get", "altitude_label"],
          "text-size": 12,
          "text-anchor": "bottom",
          "text-offset": [0, -0.5],
          "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
          "symbol-placement": "line",
          "symbol-spacing": 400,
        }}
        paint={{
          "text-color": textColor,
          "text-halo-color": textHaloColor,
          "text-halo-width": 2,
          "text-opacity": 0.9,
        }}
      />
    </Source>
  );
}
