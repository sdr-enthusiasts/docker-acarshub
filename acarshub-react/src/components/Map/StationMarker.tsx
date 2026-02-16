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

import { Marker } from "react-map-gl/maplibre";
import { useAppStore } from "../../store/useAppStore";
import { useSettingsStore } from "../../store/useSettingsStore";

/**
 * StationMarker Component
 *
 * Displays the ground station (receiver) location on the map.
 * Uses station coordinates from either:
 * 1. User settings (configured in Settings modal)
 * 2. Backend decoder config (from Socket.IO)
 *
 * Priority: User settings override backend values.
 */
export function StationMarker() {
  const decoders = useAppStore((state) => state.decoders);
  const settings = useSettingsStore((state) => state.settings);

  // Check if range rings are allowed by backend (privacy protection)
  const backendAllowsRangeRings = decoders?.adsb?.range_rings ?? true;

  // Don't render if backend disables range rings (station location privacy)
  if (!backendAllowsRangeRings) {
    return null;
  }

  // Determine station location (settings override backend)
  let stationLat = settings.map.stationLat;
  let stationLon = settings.map.stationLon;

  // Fallback to backend decoder config if user hasn't set custom location
  if (stationLat === 0 && stationLon === 0 && decoders?.adsb) {
    stationLat = decoders.adsb.lat;
    stationLon = decoders.adsb.lon;
  }

  // Don't render if we have no valid location
  if (stationLat === 0 && stationLon === 0) {
    return null;
  }

  return (
    <Marker longitude={stationLon} latitude={stationLat} anchor="center">
      <div className="station-marker" title="Ground Station">
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          xmlns="http://www.w3.org/2000/svg"
          role="img"
          aria-label="Ground Station"
        >
          <title>Ground Station</title>
          {/* Radio tower icon */}
          {/* Base circle */}
          <circle
            cx="10"
            cy="10"
            r="3"
            fill="var(--color-red)"
            stroke="var(--color-surface0)"
            strokeWidth="1"
          />

          {/* Antenna mast */}
          <line
            x1="10"
            y1="7"
            x2="10"
            y2="2"
            stroke="var(--color-red)"
            strokeWidth="1.5"
            strokeLinecap="round"
          />

          {/* Left antenna arm */}
          <line
            x1="10"
            y1="4"
            x2="7"
            y2="2"
            stroke="var(--color-red)"
            strokeWidth="1"
            strokeLinecap="round"
          />

          {/* Right antenna arm */}
          <line
            x1="10"
            y1="4"
            x2="13"
            y2="2"
            stroke="var(--color-red)"
            strokeWidth="1"
            strokeLinecap="round"
          />
        </svg>
      </div>
    </Marker>
  );
}
