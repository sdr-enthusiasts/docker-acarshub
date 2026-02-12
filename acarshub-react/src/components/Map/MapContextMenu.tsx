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

import { ContextMenu, type ContextMenuItem } from "../ContextMenu";

interface MapContextMenuProps {
  x: number;
  y: number;
  isFollowingAircraft: boolean;
  onClose: () => void;
  onUnfollowAircraft: () => void;
}

/**
 * MapContextMenu Component
 *
 * Context menu for right-clicking on the map (not on an aircraft).
 *
 * Actions:
 * - Unfollow Aircraft: Stops tracking the currently followed aircraft (only shown when following)
 *
 * Design Notes:
 * - Uses generic ContextMenu component
 * - Currently minimal, designed to be extended with more map actions
 * - Only shows when there's a followed aircraft to unfollow
 */
export function MapContextMenu({
  x,
  y,
  isFollowingAircraft,
  onClose,
  onUnfollowAircraft,
}: MapContextMenuProps) {
  const items: ContextMenuItem[] = [];

  // Only show unfollow option if we're currently following an aircraft
  if (isFollowingAircraft) {
    items.push({
      id: "unfollow",
      label: "Unfollow Aircraft",
      icon: "📍",
      variant: "default",
      onClick: onUnfollowAircraft,
    });
  }

  // If no items to show, don't render the menu
  if (items.length === 0) {
    return null;
  }

  return <ContextMenu x={x} y={y} items={items} onClose={onClose} />;
}
