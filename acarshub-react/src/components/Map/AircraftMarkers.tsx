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
import { Marker } from "react-map-gl/maplibre";
import { useAppStore } from "../../store/useAppStore";
import {
  getAircraftColor,
  getBaseMarker,
  shouldRotate,
  svgShapeToURI,
} from "../../utils/aircraftIcons";
import "./AircraftMarkers.scss";

interface AircraftMarkerData {
  hex: string;
  lat: number;
  lon: number;
  track?: number;
  iconHtml: string;
  width: number;
  height: number;
  shouldRotate: boolean;
}

/**
 * AircraftMarkers Component
 *
 * Renders MapLibre markers for all ADS-B aircraft positions.
 * - Consumes aircraft data from Zustand store
 * - Generates SVG icons based on aircraft type/category
 * - Rotates markers based on heading
 * - Colors markers based on alerts/messages
 * - Efficiently updates only changed markers
 */
export function AircraftMarkers() {
  const adsbAircraft = useAppStore((state) => state.adsbAircraft);
  const messageGroups = useAppStore((state) => state.messageGroups);

  // Prepare marker data using useMemo to avoid infinite loops
  const aircraftMarkers = useMemo(() => {
    const aircraft = adsbAircraft?.aircraft || [];
    const markers: AircraftMarkerData[] = [];

    for (const ac of aircraft) {
      // Skip aircraft without position
      if (ac.lat === undefined || ac.lon === undefined) {
        continue;
      }

      // Check if aircraft has ACARS messages or alerts
      const acarsGroup = messageGroups.get(ac.hex.toUpperCase());
      const hasMessages =
        acarsGroup !== undefined && acarsGroup.messages.length > 0;
      const hasAlerts = acarsGroup?.has_alerts || false;

      // Get icon for this aircraft
      const { name: shapeName, scale } = getBaseMarker(
        ac.category,
        ac.type,
        undefined, // typeDescription - not available from ADS-B
        undefined, // wtc - not available from ADS-B
        ac.alt_baro,
      );

      // Get color based on state
      const color = getAircraftColor(hasAlerts, hasMessages, ac.alt_baro);

      // Generate SVG icon
      const iconData = svgShapeToURI(shapeName, 0.5, scale * 1.5, color);

      markers.push({
        hex: ac.hex,
        lat: ac.lat,
        lon: ac.lon,
        track: ac.track,
        iconHtml: iconData.svg,
        width: iconData.width,
        height: iconData.height,
        shouldRotate: shouldRotate(shapeName),
      });
    }

    return markers;
  }, [adsbAircraft, messageGroups]);

  // No aircraft data yet
  if (!adsbAircraft) {
    return null;
  }

  return (
    <>
      {aircraftMarkers.map((aircraft) => {
        const rotation =
          aircraft.shouldRotate && aircraft.track !== undefined
            ? aircraft.track
            : 0;

        return (
          <Marker
            key={aircraft.hex}
            longitude={aircraft.lon}
            latitude={aircraft.lat}
            anchor="center"
          >
            <div
              className="aircraft-marker"
              style={{
                width: `${aircraft.width}px`,
                height: `${aircraft.height}px`,
                transform: `rotate(${rotation}deg)`,
                transformOrigin: "center center",
              }}
            >
              <img
                src={aircraft.iconHtml}
                alt={`Aircraft ${aircraft.hex}`}
                style={{
                  width: "100%",
                  height: "100%",
                  pointerEvents: "none",
                }}
              />
            </div>
          </Marker>
        );
      })}
    </>
  );
}
