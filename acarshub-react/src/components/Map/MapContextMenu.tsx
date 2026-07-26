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
  isPaused: boolean;
  onClose: () => void;
  onUnfollowAircraft: () => void;
  onTogglePause: () => void;
}

/**
 * MapContextMenu Component
 *
 * Context menu for right-clicking on the map (not on an aircraft).
 *
 * Actions:
 * - Pause/Resume: Toggle aircraft updates
 * - Unfollow Aircraft: Stops tracking the currently followed aircraft (only shown when following)
 *
 * Design Notes:
 * - Uses generic ContextMenu component
 * - Always shows (at least pause/resume option)
 * - Adapts menu items based on current state (paused, following)
 */
export function MapContextMenu({
  x,
  y,
  isFollowingAircraft,
  isPaused,
  onClose,
  onUnfollowAircraft,
  onTogglePause,
}: MapContextMenuProps) {
  const items: ContextMenuItem[] = [];

  // Always show pause/resume option
  //
  // NIT-09: item onClick handlers do NOT call onClose() themselves — the
  // underlying ContextMenu component already calls onClose() after every
  // item click (see ContextMenu.tsx handleItemClick), so doing it here too
  // was a redundant double-call. Harmless in practice (onClose is
  // idempotent) but dead/misleading code.
  items.push({
    id: "toggle-pause",
    label: isPaused ? "Resume Updates" : "Pause Updates",
    icon: isPaused ? "▶" : "⏸",
    variant: "default",
    onClick: onTogglePause,
  });

  // Show unfollow option if we're currently following an aircraft
  if (isFollowingAircraft) {
    items.push({
      id: "unfollow",
      label: "Unfollow Aircraft",
      icon: "📍",
      variant: "default",
      onClick: onUnfollowAircraft,
    });
  }

  return <ContextMenu x={x} y={y} items={items} onClose={onClose} />;
}
