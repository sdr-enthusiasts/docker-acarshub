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

import { useEffect, useRef, useState } from "react";
import { type IconComponent, IconLayerGroup } from "../icons";

interface OverlayOption {
  id: string;
  label: string;
  icon: IconComponent;
  active: boolean;
  onClick: () => void;
}

interface MapOverlaysMenuProps {
  overlays: OverlayOption[];
}

/**
 * MapOverlaysMenu Component
 *
 * Height-based flyout menu for map overlay toggles (range rings, weather, aviation charts).
 * Collapses the overlays group into a single button at viewport heights ≤ 790px to prevent
 * the control panel from overflowing off-screen on short displays (landscape phones, small
 * tablets, compact laptop screens).
 *
 * Features:
 * - Click-outside to close
 * - Active overlay count badge
 * - Keyboard accessible (Escape to close)
 * - 44px touch targets
 * - Catppuccin theming
 * - Dropdown opens downward (overlays group sits near the top of the control panel)
 *
 * Design Notes:
 * - Shown at max-height: 790px (controlled entirely by SCSS)
 * - Tall screens show individual overlay buttons instead (map-controls__overlay--tall)
 * - Mirrors MapFiltersMenu pattern but uses a height breakpoint rather than width
 */
export function MapOverlaysMenu({ overlays }: MapOverlaysMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Count active overlays for badge
  const activeCount = overlays.filter((o) => o.active).length;

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [isOpen]);

  // Close menu on Escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      return () => {
        document.removeEventListener("keydown", handleEscape);
      };
    }
  }, [isOpen]);

  return (
    <div className="map-overlays-menu" ref={menuRef}>
      <button
        type="button"
        className={`map-overlays-menu__button ${isOpen ? "map-overlays-menu__button--open" : ""}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Map overlays"
        aria-expanded={isOpen}
      >
        <IconLayerGroup />
        {activeCount > 0 && (
          <span className="map-overlays-menu__badge">{activeCount}</span>
        )}
      </button>

      {isOpen && (
        <div className="map-overlays-menu__dropdown">
          {overlays.map((overlay) => {
            const OverlayIcon = overlay.icon;
            return (
              <label key={overlay.id} className="map-overlays-menu__item">
                <OverlayIcon className="map-overlays-menu__icon" />
                <span className="map-overlays-menu__label">
                  {overlay.label}
                </span>
                <input
                  type="checkbox"
                  checked={overlay.active}
                  onChange={() => {
                    overlay.onClick();
                  }}
                  aria-label={overlay.label}
                />
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
