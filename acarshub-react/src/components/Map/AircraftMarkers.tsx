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

import { useEffect, useMemo, useState } from "react";
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
import { getSpriteLoader } from "../../utils/spriteLoader";
import { AircraftContextMenu } from "./AircraftContextMenu";
import { AircraftMessagesModal } from "./AircraftMessagesModal";
import { AnimatedSprite } from "./AnimatedSprite";
import "../../styles/components/_aircraft-markers.scss";
import "./AircraftSprite.scss";

interface AircraftMarkersProps {
  /** Hex of currently hovered aircraft (from list) */
  hoveredAircraftHex?: string | null;
  /** Hex of currently followed aircraft */
  followedAircraftHex?: string | null;
  /** Callback when follow/unfollow is requested */
  onFollowAircraft?: (hex: string | null) => void;
  /** Optional pre-paired aircraft (for frozen positions during zoom) */
  aircraft?: PairedAircraft[];
}

interface AircraftMarkerData {
  hex: string;
  lat: number;
  lon: number;
  track?: number;
  rotation: number;
  iconHtml: string;
  width: number;
  height: number;
  shouldRotate: boolean;
  aircraft: PairedAircraft;
  hasUnreadMessages: boolean;
  // Sprite rendering data (when useSprites is true)
  spriteName?: string;
  spritePosition?: {
    x: number;
    y: number;
    width: number;
    height: number;
    backgroundSize: string;
  };
  spriteClass?: string;
  spriteFrames?: number[];
  spriteFrameTime?: number;
}

interface TooltipState {
  hex: string;
  showBelow: boolean;
  alignLeft: boolean;
  alignRight: boolean;
}

interface ContextMenuState {
  aircraft: PairedAircraft;
  x: number;
  y: number;
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
/**
 * Map category code to pw-silhouettes generic category code
 * ADS-B categories (A1-A7, etc.) -> pw-silhouettes generic codes (4/1-4/7 etc.)
 *
 * pw-silhouettes format: emitter_category/size_code
 * - 2/x = Balloon/Airship
 * - 3/x = Glider/Ultralight
 * - 4/x = Aircraft (1=light, 2=small, 3=large, 4=heavy, 5=super heavy, 6=high perf, 7=rotorcraft)
 */
function mapCategoryToSpriteCode(category?: string): string | undefined {
  if (!category) return undefined;

  // Map based on pw-silhouettes generic category codes
  const categoryMap: Record<string, string> = {
    A1: "4/1", // Light aircraft (< 7t)
    A2: "4/2", // Small aircraft (< 34t)
    A3: "4/3", // Large aircraft (< 136t)
    A4: "4/3", // Large aircraft (< 136t)
    A5: "4/4", // Heavy aircraft (> 136t)
    A6: "4/6", // High performance
    A7: "4/7", // Rotorcraft/Helicopter
    B1: "3/1", // Glider
    B2: "2/1", // Balloon/Lighter-than-air
    B6: "4/1", // UAV (map to light aircraft as fallback)
  };

  return categoryMap[category];
}

/**
 * Get the decoder type from an aircraft's messages
 * Returns the decoder type of the most recent message
 *
 * @param aircraft - Paired aircraft with potential messages
 * @returns Decoder type (ACARS, VDLM, HFDL, etc.) or undefined
 */
function getAircraftDecoderType(aircraft: PairedAircraft): string | undefined {
  if (!aircraft.matchedGroup || aircraft.matchedGroup.messages.length === 0) {
    return undefined;
  }

  // Find the most recent message by timestamp
  // Use msg_time or timestamp field, whichever is available
  let mostRecentMessage = aircraft.matchedGroup.messages[0];
  let mostRecentTime =
    mostRecentMessage.timestamp || mostRecentMessage.msg_time || 0;

  for (const message of aircraft.matchedGroup.messages) {
    const messageTime = message.timestamp || message.msg_time || 0;
    if (messageTime > mostRecentTime) {
      mostRecentTime = messageTime;
      mostRecentMessage = message;
    }
  }

  return mostRecentMessage.message_type;
}

/**
 * Get better generic sprite name based on aircraft shape characteristics
 * Overrides pw-silhouettes generic mapping when it doesn't match aircraft type
 *
 * @param shapeName - Shape name from aircraftIcons.ts (e.g., "jet_swept", "turboprop")
 * @param categoryCode - Generic category code (e.g., "4/2")
 * @returns Better sprite name or undefined to use default generic
 */
function getBetterGenericSprite(
  shapeName: string,
  categoryCode?: string,
): string | undefined {
  // For small aircraft (4/2), pw-silhouettes uses DH8B (turboprop) by default
  // but many small jets (CRJ, E145, etc) fall into this category
  if (categoryCode === "4/2") {
    const isJet =
      shapeName.includes("jet") ||
      shapeName === "airliner" ||
      shapeName === "heavy_2e" ||
      shapeName === "heavy_4e";

    if (isJet) {
      // Use E190 (small jet) instead of DH8B (turboprop) for jets
      return "E190";
    }
  }

  return undefined; // Use default generic mapping
}

export function AircraftMarkers({
  hoveredAircraftHex,
  followedAircraftHex,
  onFollowAircraft,
  aircraft: externalAircraft,
}: AircraftMarkersProps = {}) {
  const adsbAircraft = useAppStore((state) => state.adsbAircraft);
  const messageGroups = useAppStore((state) => state.messageGroups);
  const readMessageUids = useAppStore((state) => state.readMessageUids);
  const altitudeUnit = useSettingsStore(
    (state) => state.settings.regional.altitudeUnit,
  );
  const mapSettings = useSettingsStore((state) => state.settings.map);
  const useSprites = useSettingsStore((state) => state.settings.map.useSprites);
  const colorByDecoder = useSettingsStore(
    (state) => state.settings.map.colorByDecoder,
  );
  const groundAltitudeThreshold = useSettingsStore(
    (state) => state.settings.map.groundAltitudeThreshold,
  );
  const [localHoveredAircraft, setLocalHoveredAircraft] =
    useState<TooltipState | null>(null);
  const [selectedMessageGroup, setSelectedMessageGroup] =
    useState<MessageGroup | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [spriteLoadError, setSpriteLoadError] = useState(false);

  // Preload spritesheet on mount with timeout
  useEffect(() => {
    console.log("[AircraftMarkers] Full map settings:", mapSettings);
    console.log("[AircraftMarkers] useSprites setting:", useSprites);
    if (useSprites) {
      const loader = getSpriteLoader();
      console.log(
        "[AircraftMarkers] Sprite loader isLoaded:",
        loader.isLoaded(),
      );
      if (!loader.isLoaded()) {
        // Set a timeout to prevent indefinite hanging
        const timeoutId = setTimeout(() => {
          if (!loader.isLoaded()) {
            console.warn(
              "[AircraftMarkers] Sprite loading timeout - continuing without sprites",
            );
            setSpriteLoadError(true);
          }
        }, 5000); // 5 second timeout

        console.log("[AircraftMarkers] Starting sprite load...");
        loader
          .load()
          .then(() => {
            console.log(
              "[AircraftMarkers] Sprite load SUCCESS, isLoaded:",
              loader.isLoaded(),
            );
            clearTimeout(timeoutId);
          })
          .catch((err) => {
            console.error(
              "[AircraftMarkers] Failed to preload spritesheet:",
              err,
            );
            clearTimeout(timeoutId);
            setSpriteLoadError(true);
          });

        return () => clearTimeout(timeoutId);
      } else {
        console.log("[AircraftMarkers] Sprites already loaded");
      }
    }
  }, [useSprites, mapSettings]);

  // Pair ADS-B aircraft with ACARS messages (or use external aircraft if provided)
  const pairedAircraft = useMemo(() => {
    if (externalAircraft) {
      return externalAircraft;
    }
    const aircraft = adsbAircraft?.aircraft || [];
    return pairADSBWithACARSMessages(aircraft, messageGroups);
  }, [adsbAircraft, messageGroups, externalAircraft]);

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
    const spriteLoader =
      useSprites && !spriteLoadError ? getSpriteLoader() : null;

    console.log(
      "[AircraftMarkers] Building markers - useSprites:",
      useSprites,
      "spriteLoadError:",
      spriteLoadError,
      "spriteLoader:",
      spriteLoader ? "present" : "null",
      "isLoaded:",
      spriteLoader?.isLoaded(),
    );

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

      // Get decoder type for color-by-decoder mode
      const decoderType = getAircraftDecoderType(aircraft);

      // Get color based on state or decoder type
      const color = getAircraftColor(
        aircraft.hasAlerts,
        aircraft.hasMessages,
        aircraft.alt_baro,
        colorByDecoder,
        decoderType,
        groundAltitudeThreshold,
      );

      // Generate SVG icon (always generate as fallback)
      const iconData = svgShapeToURI(shapeName, 0.5, scale * 1.5, color);

      // Sprite data (if using sprites)
      let spriteName: string | undefined;
      let spritePosition: AircraftMarkerData["spritePosition"];
      let spriteClass: string | undefined;
      let spriteFrames: number[] | undefined;
      let spriteFrameTime: number | undefined;

      if (useSprites && !spriteLoadError && spriteLoader?.isLoaded()) {
        // Get sprite for this aircraft
        const categoryCode = mapCategoryToSpriteCode(aircraft.category);
        let spriteResult = spriteLoader.getSprite(aircraft.type, categoryCode);

        if (markers.length === 0) {
          console.log("[AircraftMarkers] First aircraft sprite lookup:", {
            hex: aircraft.hex,
            type: aircraft.type,
            categoryCode,
            spriteResult: spriteResult ? "found" : "null",
          });
        }

        // If we didn't find an exact airframe match, try shape-based generic
        if (spriteResult && spriteResult.matchType !== "airframe") {
          const betterSpriteName = getBetterGenericSprite(
            shapeName,
            categoryCode,
          );
          if (betterSpriteName) {
            // Try to use the better sprite directly
            const betterResult = spriteLoader.getSprite(betterSpriteName);
            if (betterResult) {
              spriteResult = betterResult;
            }
          }
        }

        if (spriteResult) {
          spriteName = spriteResult.spriteName;
          const position = spriteLoader.getSpritePosition(
            spriteResult.spriteName,
            0,
          );

          if (position) {
            spritePosition = {
              x: position.x,
              y: position.y,
              width: position.width,
              height: position.height,
              backgroundSize:
                spriteLoader.getCSSBackgroundSize() ?? "345.6px 1468.8px",
            };
            spriteFrames = position.frames;
            spriteFrameTime = position.frameTime;

            // Determine sprite state class
            // Priority: alerts > decoder type/messages > low altitude > default
            if (aircraft.hasAlerts) {
              spriteClass = "has-alerts";
            } else if (colorByDecoder && decoderType) {
              // Color by decoder type (based on most recent message)
              const normalizedType = decoderType.toUpperCase();
              switch (normalizedType) {
                case "ACARS":
                  spriteClass = "decoder-acars";
                  break;
                case "VDLM":
                case "VDL-M2":
                  spriteClass = "decoder-vdlm";
                  break;
                case "HFDL":
                  spriteClass = "decoder-hfdl";
                  break;
                case "IMSL":
                  spriteClass = "decoder-imsl";
                  break;
                case "IRDM":
                  spriteClass = "decoder-irdm";
                  break;
                default:
                  spriteClass = "default";
              }
            } else if (aircraft.hasMessages) {
              // Legacy behavior: use VDLM (green) sprite for any messages
              spriteClass = "decoder-vdlm";
            } else if (
              aircraft.alt_baro === "ground" ||
              (typeof aircraft.alt_baro === "number" &&
                aircraft.alt_baro <= groundAltitudeThreshold)
            ) {
              spriteClass = "low-altitude";
            } else {
              spriteClass = "default";
            }
          }
        }
      }

      if (markers.length === 0 && useSprites) {
        console.log("[AircraftMarkers] First marker sprite data:", {
          spriteName,
          hasSpritePosition: !!spritePosition,
          spriteClass,
        });
      }

      // Calculate rotation once to prevent recalculation on every render
      // Defensive checks: ensure track is a valid number, default to 0 if not
      let rotation = 0;
      if (shouldRotate(shapeName) && aircraft.track !== undefined) {
        const trackValue = Number(aircraft.track);
        rotation = Number.isFinite(trackValue) ? trackValue : 0;
      }

      // Debug logging for rotation issues
      if (markers.length === 0) {
        console.log("[AircraftMarkers] First aircraft rotation debug:", {
          hex: aircraft.hex,
          track: aircraft.track,
          trackType: typeof aircraft.track,
          shouldRotate: shouldRotate(shapeName),
          calculatedRotation: rotation,
        });
      }

      markers.push({
        hex: aircraft.hex,
        lat: aircraft.lat,
        lon: aircraft.lon,
        track: aircraft.track,
        rotation: rotation,
        iconHtml: iconData.svg,
        width: iconData.width,
        height: iconData.height,
        shouldRotate: shouldRotate(shapeName),
        aircraft,
        hasUnreadMessages,
        spriteName,
        spritePosition,
        spriteClass,
        spriteFrames,
        spriteFrameTime,
      });
    }

    return markers;
  }, [
    filteredPairedAircraft,
    readMessageUids,
    useSprites,
    colorByDecoder,
    groundAltitudeThreshold,
    spriteLoadError,
  ]);

  // Handle marker click
  const handleMarkerClick = (aircraft: PairedAircraft) => {
    // Only open modal if aircraft has ACARS messages
    if (aircraft.matchedGroup) {
      setSelectedMessageGroup(aircraft.matchedGroup);
    }
  };

  // Handle right-click on marker
  const handleMarkerContextMenu = (
    event: React.MouseEvent,
    aircraft: PairedAircraft,
  ) => {
    event.preventDefault();
    event.stopPropagation(); // Prevent map context menu from also appearing
    setContextMenu({
      aircraft,
      x: event.clientX,
      y: event.clientY,
    });
  };

  // Handle modal close
  const handleCloseModal = () => {
    setSelectedMessageGroup(null);
  };

  // Handle context menu close
  const handleContextMenuClose = () => {
    setContextMenu(null);
  };

  // Handle view messages from context menu
  const handleViewMessages = () => {
    if (contextMenu?.aircraft.matchedGroup) {
      setSelectedMessageGroup(contextMenu.aircraft.matchedGroup);
    }
  };

  // Handle follow aircraft from context menu
  const handleFollowAircraft = () => {
    if (contextMenu?.aircraft && onFollowAircraft) {
      onFollowAircraft(contextMenu.aircraft.hex);
    }
  };

  // Handle unfollow aircraft from context menu
  const handleUnfollowAircraft = () => {
    if (onFollowAircraft) {
      onFollowAircraft(null);
    }
  };

  // No aircraft data yet
  if (!adsbAircraft) {
    return null;
  }

  return (
    <>
      {aircraftMarkers.map((markerData) => {
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
              {useSprites && markerData.spritePosition ? (
                // Sprite rendering - use AnimatedSprite for multi-frame, static button otherwise
                markerData.spriteFrames &&
                markerData.spriteFrames.length > 1 ? (
                  <AnimatedSprite
                    spriteName={markerData.spriteName || ""}
                    spriteClass={markerData.spriteClass || ""}
                    frames={markerData.spriteFrames}
                    frameTime={markerData.spriteFrameTime || 100}
                    rotation={markerData.rotation}
                    onClick={() => handleMarkerClick(markerData.aircraft)}
                    onContextMenu={(e) =>
                      handleMarkerContextMenu(e, markerData.aircraft)
                    }
                    onMouseEnter={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const distanceFromTop = rect.top;
                      const showBelow = distanceFromTop < 280;
                      const mapContainer =
                        e.currentTarget.closest(".maplibregl-map");
                      const mapBounds = mapContainer
                        ? mapContainer.getBoundingClientRect()
                        : { left: 0, right: window.innerWidth };
                      const tooltipWidth = 280;
                      const halfTooltipWidth = tooltipWidth / 2;
                      const markerCenterX = rect.left + rect.width / 2;
                      const tooltipLeftEdgeIfCentered =
                        markerCenterX - halfTooltipWidth;
                      const tooltipRightEdgeIfCentered =
                        markerCenterX + halfTooltipWidth;
                      const wouldClipLeft =
                        tooltipLeftEdgeIfCentered < mapBounds.left;
                      const wouldClipRight =
                        tooltipRightEdgeIfCentered > mapBounds.right;
                      const alignLeft = wouldClipLeft && !wouldClipRight;
                      const alignRight = wouldClipRight && !wouldClipLeft;
                      setLocalHoveredAircraft({
                        hex: markerData.hex,
                        showBelow,
                        alignLeft,
                        alignRight,
                      });
                    }}
                    onMouseLeave={() => setLocalHoveredAircraft(null)}
                    isHovered={hoveredAircraftHex === markerData.hex}
                    isFollowed={followedAircraftHex === markerData.hex}
                    hasUnreadMessages={markerData.hasUnreadMessages}
                    ariaLabel={`Aircraft ${markerData.hex}${markerData.aircraft.hasMessages ? " - Click to view messages" : ""}`}
                    cursorStyle={
                      markerData.aircraft.hasMessages ? "pointer" : "default"
                    }
                  />
                ) : (
                  <button
                    type="button"
                    className={`aircraft-sprite ${markerData.spriteClass || ""} ${
                      hoveredAircraftHex === markerData.hex
                        ? "aircraft-marker--hovered"
                        : ""
                    } ${markerData.hasUnreadMessages ? "aircraft-marker--unread" : ""} ${
                      followedAircraftHex === markerData.hex
                        ? "aircraft-marker--followed"
                        : ""
                    }`}
                    aria-label={`Aircraft ${markerData.hex}${markerData.aircraft.hasMessages ? " - Click to view messages" : ""}`}
                    style={{
                      backgroundPosition: `-${markerData.spritePosition.x}px -${markerData.spritePosition.y}px`,
                      backgroundSize: markerData.spritePosition.backgroundSize,
                      width: `${markerData.spritePosition.width}px`,
                      height: `${markerData.spritePosition.height}px`,
                      transform: `rotate(${markerData.rotation}deg)`,
                      transformOrigin: "center center",
                      cursor: markerData.aircraft.hasMessages
                        ? "pointer"
                        : "default",
                    }}
                    onClick={() => handleMarkerClick(markerData.aircraft)}
                    onContextMenu={(e) =>
                      handleMarkerContextMenu(e, markerData.aircraft)
                    }
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
                  />
                )
              ) : (
                // SVG rendering (fallback or when sprites disabled)
                <button
                  type="button"
                  className={`aircraft-marker ${
                    hoveredAircraftHex === markerData.hex
                      ? "aircraft-marker--hovered"
                      : ""
                  } ${markerData.hasUnreadMessages ? "aircraft-marker--unread" : ""} ${
                    followedAircraftHex === markerData.hex
                      ? "aircraft-marker--followed"
                      : ""
                  }`}
                  aria-label={`Aircraft ${markerData.hex}${markerData.aircraft.hasMessages ? " - Click to view messages" : ""}`}
                  style={{
                    width: `${markerData.width}px`,
                    height: `${markerData.height}px`,
                    transform: `rotate(${markerData.rotation}deg)`,
                    transformOrigin: "center center",
                    cursor: markerData.aircraft.hasMessages
                      ? "pointer"
                      : "default",
                  }}
                  onClick={() => handleMarkerClick(markerData.aircraft)}
                  onContextMenu={(e) =>
                    handleMarkerContextMenu(e, markerData.aircraft)
                  }
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
              )}
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

      {/* Context menu for aircraft actions */}
      {contextMenu && (
        <AircraftContextMenu
          aircraft={contextMenu.aircraft}
          x={contextMenu.x}
          y={contextMenu.y}
          isFollowed={contextMenu.aircraft.hex === followedAircraftHex}
          onClose={handleContextMenuClose}
          onViewMessages={handleViewMessages}
          onFollow={handleFollowAircraft}
          onUnfollow={handleUnfollowAircraft}
        />
      )}
    </>
  );
}
