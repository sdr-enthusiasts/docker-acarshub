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
          width="32"
          height="32"
          viewBox="0 0 32 32"
          xmlns="http://www.w3.org/2000/svg"
          role="img"
          aria-label="Ground Station"
        >
          <title>Ground Station</title>
          {/* Outer circle (base) */}
          <circle
            cx="16"
            cy="16"
            r="14"
            fill="var(--color-red)"
            fillOpacity="0.3"
            stroke="var(--color-red)"
            strokeWidth="2"
          />

          {/* Inner circle (core) */}
          <circle cx="16" cy="16" r="6" fill="var(--color-red)" />

          {/* Radio waves (animated pulses) */}
          <circle
            cx="16"
            cy="16"
            r="10"
            fill="none"
            stroke="var(--color-red)"
            strokeWidth="2"
            opacity="0.6"
            className="station-marker__pulse station-marker__pulse--1"
          />
          <circle
            cx="16"
            cy="16"
            r="10"
            fill="none"
            stroke="var(--color-red)"
            strokeWidth="2"
            opacity="0.4"
            className="station-marker__pulse station-marker__pulse--2"
          />
          <circle
            cx="16"
            cy="16"
            r="10"
            fill="none"
            stroke="var(--color-red)"
            strokeWidth="2"
            opacity="0.2"
            className="station-marker__pulse station-marker__pulse--3"
          />
        </svg>
      </div>
    </Marker>
  );
}
