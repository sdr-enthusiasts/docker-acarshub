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

import { useEffect, useMemo, useRef, useState } from "react";
import type { MapRef } from "react-map-gl/maplibre";
import { MapComponent, MapControls } from "../components/Map";
import { AircraftList } from "../components/Map/AircraftList";
import { socketService } from "../services/socket";
import { useAppStore } from "../store/useAppStore";
import { useSettingsStore } from "../store/useSettingsStore";
import type { PairedAircraft } from "../utils/aircraftPairing";
import { pairADSBWithACARSMessages } from "../utils/aircraftPairing";
import { mapLogger } from "../utils/logger";
import "./LiveMapPage.scss";

/**
 * LiveMapPage Component
 * Displays real-time aircraft positions on a map using ADS-B data and ACARS messages
 *
 * Features:
 * - High-performance MapLibre GL JS rendering
 * - Catppuccin-themed map styles (Mocha/Latte)
 * - Aircraft markers with rotation
 * - Data blocks with flight information
 * - NEXRAD weather radar overlay
 * - Range rings from station
 * - Filtering (ACARS-only, unread messages)
 * - Sortable aircraft list
 */
export const LiveMapPage = () => {
  const setCurrentPage = useAppStore((state) => state.setCurrentPage);
  const adsbAircraft = useAppStore((state) => state.adsbAircraft);
  const messageGroups = useAppStore((state) => state.messageGroups);
  const mapSettings = useSettingsStore((state) => state.settings.map);

  const mapRef = useRef<MapRef>(null);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [hoveredAircraftHex, setHoveredAircraftHex] = useState<string | null>(
    null,
  );

  // Pair ADS-B aircraft with ACARS message groups
  const pairedAircraft = useMemo(() => {
    const aircraft = adsbAircraft?.aircraft || [];
    return pairADSBWithACARSMessages(aircraft, messageGroups);
  }, [adsbAircraft, messageGroups]);

  useEffect(() => {
    setCurrentPage("Live Map");
    socketService.notifyPageChange("Live Map");
  }, [setCurrentPage]);

  const handleMapLoad = () => {
    setIsMapLoaded(true);
    mapLogger.info("Map loaded successfully");
  };

  // Handle aircraft click from list
  const handleAircraftClick = (aircraft: PairedAircraft) => {
    // Center map on aircraft if position available
    if (aircraft.lat && aircraft.lon && mapRef.current) {
      mapRef.current.flyTo({
        center: [aircraft.lon, aircraft.lat],
        zoom: 10,
        duration: 1000,
      });
    }
  };

  // Handle aircraft hover from list
  const handleAircraftHover = (aircraft: PairedAircraft | null) => {
    setHoveredAircraftHex(aircraft?.hex || null);
  };

  return (
    <div className="page live-map-page">
      <div className="live-map-page__container">
        {/* Aircraft list sidebar */}
        <aside className="live-map-page__sidebar">
          <AircraftList
            aircraft={pairedAircraft}
            onAircraftClick={handleAircraftClick}
            onAircraftHover={handleAircraftHover}
            hoveredAircraft={hoveredAircraftHex}
          />
        </aside>

        {/* Map container (main area) */}
        <main className="live-map-page__map">
          <MapComponent
            mapRef={mapRef}
            onLoad={handleMapLoad}
            hoveredAircraftHex={hoveredAircraftHex}
            className={isMapLoaded ? "live-map-page__map--loaded" : ""}
          />

          {/* Floating map controls */}
          {isMapLoaded && <MapControls />}

          {!isMapLoaded && (
            <div className="live-map-page__map-loading">
              <div className="live-map-page__spinner" />
              <p>Loading map...</p>
            </div>
          )}

          {/* Map overlay info (top-left corner) */}
          {isMapLoaded && (
            <div className="live-map-page__map-info">
              <div className="live-map-page__map-provider">
                Provider:{" "}
                {mapSettings.provider === "carto"
                  ? "CartoDB (Free)"
                  : "Maptiler"}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
