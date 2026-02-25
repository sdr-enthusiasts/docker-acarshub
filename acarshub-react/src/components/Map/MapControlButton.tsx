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

import { useState } from "react";
import type { IconComponent } from "../icons";

interface MapControlButtonProps {
  /** Icon component to display */
  icon: IconComponent;
  /** Whether the control is active/enabled */
  active: boolean;
  /** Callback when button is clicked */
  onClick: () => void;
  /** Tooltip text to show on hover */
  tooltip: string;
  /** Optional additional class name */
  className?: string;
  /** Optional disabled state */
  disabled?: boolean;
}

/**
 * MapControlButton Component
 *
 * A styled button for map controls with Font Awesome icon and tooltip.
 * Used for toggles like showing data blocks, NEXRAD, range rings, etc.
 */
export function MapControlButton({
  icon: Icon,
  active,
  onClick,
  tooltip,
  className = "",
  disabled = false,
}: MapControlButtonProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <button
      type="button"
      className={`map-control-button ${active ? "map-control-button--active" : ""} ${className}`}
      onClick={onClick}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      disabled={disabled}
      aria-label={tooltip}
    >
      <Icon />
      {showTooltip && (
        <span className="map-control-button__tooltip">{tooltip}</span>
      )}
    </button>
  );
}
