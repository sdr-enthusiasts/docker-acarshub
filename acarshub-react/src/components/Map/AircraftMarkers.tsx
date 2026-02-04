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

import { useMemo, useState } from "react";
import { Marker } from "react-map-gl/maplibre";
import { useAppStore } from "../../store/useAppStore";
import { useSettingsStore } from "../../store/useSettingsStore";
import type { MessageGroup } from "../../types";
import {
  getAircraftColor,
  getBaseMarker,
  shouldRotate,
  svgShapeToURI,
} from "../../utils/aircraftIcons";
import {
  formatAltitude,
  formatGroundSpeed,
  formatHeading,
  getDisplayCallsign,
  type PairedAircraft,
  pairADSBWithACARSMessages,
} from "../../utils/aircraftPairing";
import { AircraftMessagesModal } from "./AircraftMessagesModal";
import "../../styles/components/_aircraft-markers.scss";

interface AircraftMarkersProps {
  /** Hex of currently hovered aircraft (from list) */
  hoveredAircraftHex?: string | null;
}

interface AircraftMarkerData {
  hex: string;
  lat: number;
  lon: number;
  track?: number;
  iconHtml: string;
  width: number;
  height: number;
  shouldRotate: boolean;
  aircraft: PairedAircraft;
  hasUnreadMessages: boolean;
}

interface TooltipState {
  hex: string;
  showBelow: boolean;
  alignLeft: boolean;
  alignRight: boolean;
}

/**
 * AircraftMarkers Component
 *
 * Renders MapLibre markers for all ADS-B aircraft positions.
 * - Pairs ADS-B aircraft with ACARS message groups (hex > callsign > tail)
 * - Generates SVG icons based on aircraft type/category
 * - Rotates markers based on heading
 * - Colors markers based on alerts/messages
 * - Shows hover tooltips with aircraft details
 * - Efficiently updates only changed markers
 */
export function AircraftMarkers({
  hoveredAircraftHex,
}: AircraftMarkersProps = {}) {
  const adsbAircraft = useAppStore((state) => state.adsbAircraft);
  const messageGroups = useAppStore((state) => state.messageGroups);
  const readMessageUids = useAppStore((state) => state.readMessageUids);
  const altitudeUnit = useSettingsStore(
    (state) => state.settings.regional.altitudeUnit,
  );
  const mapSettings = useSettingsStore((state) => state.settings.map);
  const [localHoveredAircraft, setLocalHoveredAircraft] =
    useState<TooltipState | null>(null);
  const [selectedMessageGroup, setSelectedMessageGroup] =
    useState<MessageGroup | null>(null);

  // Pair ADS-B aircraft with ACARS message groups
  const pairedAircraft = useMemo(() => {
    const aircraft = adsbAircraft?.aircraft || [];
    return pairADSBWithACARSMessages(aircraft, messageGroups);
  }, [adsbAircraft, messageGroups]);

  // Filter aircraft based on map settings
  const filteredPairedAircraft = useMemo(() => {
    let filtered = pairedAircraft;

    // ACARS filters (mutually exclusive: only one should be active at a time)
    // If ACARS-only filter is enabled
    if (mapSettings.showOnlyAcars) {
      filtered = filtered.filter((a) => a.hasMessages);
    }
    // If Unread-only filter is enabled (mutually exclusive with ACARS-only)
    else if (mapSettings.showOnlyUnread) {
      filtered = filtered.filter((a) => {
        if (!a.matchedGroup) return false;
        return a.matchedGroup.messages.some(
          (msg) => !readMessageUids.has(msg.uid),
        );
      });
    }

    // dbFlags filters (additive: aircraft matching ANY of these should be shown)
    const hasDbFlagsFilters =
      mapSettings.showOnlyMilitary ||
      mapSettings.showOnlyInteresting ||
      mapSettings.showOnlyPIA ||
      mapSettings.showOnlyLADD;

    if (hasDbFlagsFilters) {
      filtered = filtered.filter((a) => {
        if (a.dbFlags === undefined || a.dbFlags === null) return false;
        const flags =
          typeof a.dbFlags === "string" ? parseInt(a.dbFlags, 10) : a.dbFlags;
        if (Number.isNaN(flags)) return false;

        // Check if aircraft matches ANY of the enabled dbFlags filters
        return (
          (mapSettings.showOnlyMilitary && (flags & 1) !== 0) ||
          (mapSettings.showOnlyInteresting && (flags & 2) !== 0) ||
          (mapSettings.showOnlyPIA && (flags & 4) !== 0) ||
          (mapSettings.showOnlyLADD && (flags & 8) !== 0)
        );
      });
    }

    return filtered;
  }, [
    pairedAircraft,
    mapSettings.showOnlyAcars,
    mapSettings.showOnlyUnread,
    mapSettings.showOnlyMilitary,
    mapSettings.showOnlyInteresting,
    mapSettings.showOnlyPIA,
    mapSettings.showOnlyLADD,
    readMessageUids,
  ]);

  // Prepare marker data using useMemo to avoid infinite loops
  const aircraftMarkers = useMemo(() => {
    const markers: AircraftMarkerData[] = [];

    for (const aircraft of filteredPairedAircraft) {
      // Skip aircraft without position
      if (aircraft.lat === undefined || aircraft.lon === undefined) {
        continue;
      }

      // Check if aircraft has unread messages
      const hasUnreadMessages = aircraft.matchedGroup
        ? aircraft.matchedGroup.messages.some(
            (msg) => !readMessageUids.has(msg.uid),
          )
        : false;

      // Get icon for this aircraft
      const { name: shapeName, scale } = getBaseMarker(
        aircraft.category,
        aircraft.type,
        undefined, // typeDescription - not available from ADS-B
        undefined, // wtc - not available from ADS-B
        aircraft.alt_baro,
      );

      // Get color based on state
      const color = getAircraftColor(
        aircraft.hasAlerts,
        aircraft.hasMessages,
        aircraft.alt_baro,
      );

      // Generate SVG icon
      const iconData = svgShapeToURI(shapeName, 0.5, scale * 1.5, color);

      markers.push({
        hex: aircraft.hex,
        lat: aircraft.lat,
        lon: aircraft.lon,
        track: aircraft.track,
        iconHtml: iconData.svg,
        width: iconData.width,
        height: iconData.height,
        shouldRotate: shouldRotate(shapeName),
        aircraft,
        hasUnreadMessages,
      });
    }

    return markers;
  }, [filteredPairedAircraft, readMessageUids]);

  // Handle marker click
  const handleMarkerClick = (aircraft: PairedAircraft) => {
    // Only open modal if aircraft has ACARS messages
    if (aircraft.matchedGroup) {
      setSelectedMessageGroup(aircraft.matchedGroup);
    }
  };

  // Handle modal close
  const handleCloseModal = () => {
    setSelectedMessageGroup(null);
  };

  // No aircraft data yet
  if (!adsbAircraft) {
    return null;
  }

  return (
    <>
      {aircraftMarkers.map((markerData) => {
        const rotation =
          markerData.shouldRotate && markerData.track !== undefined
            ? markerData.track
            : 0;

        return (
          <Marker
            key={markerData.hex}
            longitude={markerData.lon}
            latitude={markerData.lat}
            anchor="center"
            style={{
              zIndex:
                localHoveredAircraft?.hex === markerData.hex ||
                hoveredAircraftHex === markerData.hex
                  ? 10000
                  : 10,
            }}
          >
            <div
              style={{
                position: "relative",
                zIndex:
                  localHoveredAircraft?.hex === markerData.hex ||
                  hoveredAircraftHex === markerData.hex
                    ? 10000
                    : 10,
              }}
            >
              <button
                type="button"
                className={`aircraft-marker ${
                  hoveredAircraftHex === markerData.hex
                    ? "aircraft-marker--hovered"
                    : ""
                } ${markerData.hasUnreadMessages ? "aircraft-marker--unread" : ""}`}
                aria-label={`Aircraft ${markerData.hex}${markerData.aircraft.hasMessages ? " - Click to view messages" : ""}`}
                style={{
                  width: `${markerData.width}px`,
                  height: `${markerData.height}px`,
                  transform: `rotate(${rotation}deg)`,
                  transformOrigin: "center center",
                  cursor: markerData.aircraft.hasMessages
                    ? "pointer"
                    : "default",
                }}
                onClick={() => handleMarkerClick(markerData.aircraft)}
                onMouseEnter={(e) => {
                  // Calculate if tooltip should appear above or below marker
                  const rect = e.currentTarget.getBoundingClientRect();
                  const distanceFromTop = rect.top;
                  const showBelow = distanceFromTop < 280; // Show below if within 280px of top (accounts for full tooltip height)

                  // Get the map container bounds (not window bounds - accounts for sidebar)
                  const mapContainer =
                    e.currentTarget.closest(".maplibregl-map");
                  const mapBounds = mapContainer
                    ? mapContainer.getBoundingClientRect()
                    : { left: 0, right: window.innerWidth };

                  // Calculate if tooltip should align left or right based on horizontal position
                  const tooltipWidth = 280; // Approximate tooltip width
                  const halfTooltipWidth = tooltipWidth / 2;

                  // Calculate where the tooltip will actually be positioned relative to map container
                  const markerCenterX = rect.left + rect.width / 2;
                  const tooltipLeftEdgeIfCentered =
                    markerCenterX - halfTooltipWidth;
                  const tooltipRightEdgeIfCentered =
                    markerCenterX + halfTooltipWidth;

                  // Check if the centered tooltip would clip map container edges
                  const wouldClipLeft =
                    tooltipLeftEdgeIfCentered < mapBounds.left;
                  const wouldClipRight =
                    tooltipRightEdgeIfCentered > mapBounds.right;

                  // Only align left/right if tooltip would actually clip, otherwise center
                  // Mutually exclusive: can't be both left AND right aligned
                  const alignLeft = wouldClipLeft && !wouldClipRight;
                  const alignRight = wouldClipRight && !wouldClipLeft;

                  setLocalHoveredAircraft({
                    hex: markerData.hex,
                    showBelow,
                    alignLeft,
                    alignRight,
                  });
                  // Don't call onAircraftHover - pulsing glow is only for list hover
                }}
                onMouseLeave={() => {
                  setLocalHoveredAircraft(null);
                  // Don't call onAircraftHover - pulsing glow is only for list hover
                }}
              >
                <img
                  src={markerData.iconHtml}
                  alt={`Aircraft ${markerData.hex}`}
                  style={{
                    width: "100%",
                    height: "100%",
                    pointerEvents: "none",
                  }}
                />
              </button>
              {/* Tooltip outside rotated button */}
              {localHoveredAircraft &&
                localHoveredAircraft.hex === markerData.hex && (
                  <div
                    className={`aircraft-tooltip ${localHoveredAircraft.showBelow ? "aircraft-tooltip--below" : "aircraft-tooltip--above"}`}
                    style={{
                      pointerEvents: "none",
                      left: localHoveredAircraft.alignLeft
                        ? "0"
                        : localHoveredAircraft.alignRight
                          ? "auto"
                          : "50%",
                      right: localHoveredAircraft.alignRight ? "0" : "auto",
                      transform:
                        localHoveredAircraft.alignLeft ||
                        localHoveredAircraft.alignRight
                          ? "translateX(0) rotate(0deg)"
                          : "translateX(-50%) rotate(0deg)",
                    }}
                  >
                    <div className="aircraft-tooltip__content">
                      <div className="aircraft-tooltip__header">
                        <strong>
                          {getDisplayCallsign(markerData.aircraft)}
                        </strong>
                        {markerData.aircraft.matchStrategy !== "none" && (
                          <span className="aircraft-tooltip__match-badge">
                            {markerData.aircraft.matchStrategy}
                          </span>
                        )}
                      </div>

                      {markerData.aircraft.tail &&
                        markerData.aircraft.tail !==
                          getDisplayCallsign(markerData.aircraft) && (
                          <div className="aircraft-tooltip__row">
                            <span className="aircraft-tooltip__label">
                              Tail:
                            </span>
                            <span className="aircraft-tooltip__value">
                              {markerData.aircraft.tail}
                            </span>
                          </div>
                        )}

                      <div className="aircraft-tooltip__row">
                        <span className="aircraft-tooltip__label">Hex:</span>
                        <span className="aircraft-tooltip__value">
                          {markerData.aircraft.hex.toUpperCase()}
                        </span>
                      </div>

                      {markerData.aircraft.type && (
                        <div className="aircraft-tooltip__row">
                          <span className="aircraft-tooltip__label">Type:</span>
                          <span className="aircraft-tooltip__value">
                            {markerData.aircraft.type}
                          </span>
                        </div>
                      )}

                      <div className="aircraft-tooltip__row">
                        <span className="aircraft-tooltip__label">
                          Altitude:
                        </span>
                        <span className="aircraft-tooltip__value">
                          {formatAltitude(
                            markerData.aircraft.alt_baro,
                            altitudeUnit,
                          )}
                        </span>
                      </div>

                      <div className="aircraft-tooltip__row">
                        <span className="aircraft-tooltip__label">Speed:</span>
                        <span className="aircraft-tooltip__value">
                          {formatGroundSpeed(markerData.aircraft.gs)}
                        </span>
                      </div>

                      <div className="aircraft-tooltip__row">
                        <span className="aircraft-tooltip__label">
                          Heading:
                        </span>
                        <span className="aircraft-tooltip__value">
                          {formatHeading(markerData.aircraft.track)}
                        </span>
                      </div>

                      {markerData.aircraft.hasMessages && (
                        <div className="aircraft-tooltip__row aircraft-tooltip__row--highlight">
                          <span className="aircraft-tooltip__label">
                            Messages:
                          </span>
                          <span className="aircraft-tooltip__value">
                            {markerData.aircraft.messageCount}
                          </span>
                        </div>
                      )}

                      {markerData.aircraft.hasAlerts && (
                        <div className="aircraft-tooltip__row aircraft-tooltip__row--alert">
                          <span className="aircraft-tooltip__label">
                            Alerts:
                          </span>
                          <span className="aircraft-tooltip__value">
                            {markerData.aircraft.alertCount}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
            </div>
          </Marker>
        );
      })}

      {/* Aircraft Messages Modal */}
      <AircraftMessagesModal
        messageGroup={selectedMessageGroup}
        onClose={handleCloseModal}
      />
    </>
  );
}
