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

import type { PairedAircraft } from "../../utils/aircraftPairing";
import { createLogger } from "../../utils/logger";
import { ContextMenu, type ContextMenuItem } from "../ContextMenu";

const logger = createLogger("AircraftContextMenu");

interface AircraftContextMenuProps {
  aircraft: PairedAircraft;
  x: number;
  y: number;
  isFollowed: boolean;
  onClose: () => void;
  onViewMessages: () => void;
  onFollow: () => void;
  onUnfollow: () => void;
}

/**
 * AircraftContextMenu Component
 *
 * Context menu for aircraft markers on the map.
 *
 * Actions:
 * - View Messages: Opens message modal (if aircraft has messages)
 * - Follow Aircraft: Centers map and tracks aircraft movement
 * - Unfollow Aircraft: Stops tracking
 * - Copy Hex: Copies ICAO hex to clipboard
 * - Copy Callsign/Registration: Copies flight number or tail number
 *
 * Design Notes:
 * - Uses generic ContextMenu component
 * - Disables actions when not applicable (e.g., "View Messages" when no messages)
 * - Shows dynamic labels (e.g., "Copy UAL123" vs "Copy N12345")
 * - Provides user feedback via logger
 */
export function AircraftContextMenu({
  aircraft,
  x,
  y,
  isFollowed,
  onClose,
  onViewMessages,
  onFollow,
  onUnfollow,
}: AircraftContextMenuProps) {
  const hasMessages = aircraft.hasMessages;
  const displayId = aircraft.flight || aircraft.tail || aircraft.hex;

  const handleCopyHex = () => {
    navigator.clipboard
      .writeText(aircraft.hex.toUpperCase())
      .then(() => {
        logger.info("Copied hex to clipboard", { hex: aircraft.hex });
      })
      .catch((err) => {
        logger.error("Failed to copy hex to clipboard", {
          hex: aircraft.hex,
          error: err.message,
        });
      });
  };

  const handleCopyIdentifier = () => {
    const identifier = aircraft.flight || aircraft.tail || aircraft.hex;
    navigator.clipboard
      .writeText(identifier.toUpperCase())
      .then(() => {
        logger.info("Copied identifier to clipboard", { identifier });
      })
      .catch((err) => {
        logger.error("Failed to copy identifier to clipboard", {
          identifier,
          error: err.message,
        });
      });
  };

  const items: ContextMenuItem[] = [
    {
      id: "view-messages",
      label: "View Messages",
      icon: "✉️",
      disabled: !hasMessages,
      variant: "primary",
      onClick: onViewMessages,
    },
    {
      id: "divider-1",
      label: "",
      divider: true,
      onClick: () => {},
    },
    {
      id: "follow",
      label: isFollowed ? "Unfollow Aircraft" : "Follow Aircraft",
      icon: isFollowed ? "📍" : "🎯",
      variant: isFollowed ? "default" : "primary",
      onClick: isFollowed ? onUnfollow : onFollow,
    },
    {
      id: "divider-2",
      label: "",
      divider: true,
      onClick: () => {},
    },
    {
      id: "copy-hex",
      label: `Copy Hex (${aircraft.hex.toUpperCase()})`,
      icon: "📋",
      onClick: handleCopyHex,
    },
    {
      id: "copy-identifier",
      label: `Copy ${aircraft.flight ? "Callsign" : aircraft.tail ? "Registration" : "Hex"} (${displayId.toUpperCase()})`,
      icon: "📋",
      onClick: handleCopyIdentifier,
    },
  ];

  return <ContextMenu x={x} y={y} items={items} onClose={onClose} />;
}
