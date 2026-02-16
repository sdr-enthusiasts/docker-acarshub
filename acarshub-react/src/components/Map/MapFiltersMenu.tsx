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

import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { faEllipsisV } from "@fortawesome/free-solid-svg-icons/faEllipsisV";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect, useRef, useState } from "react";

interface FilterOption {
  id: string;
  label: string;
  icon: IconDefinition;
  active: boolean;
  onClick: () => void;
}

interface MapFiltersMenuProps {
  filters: FilterOption[];
}

/**
 * MapFiltersMenu Component
 *
 * Mobile-optimized flyout menu for map filter toggles.
 * Appears as a single button that opens a dropdown menu with checkboxes.
 *
 * Features:
 * - Click-outside to close
 * - Active filter count badge
 * - Keyboard accessible
 * - 44px touch targets
 * - Catppuccin theming
 *
 * Design Notes:
 * - Used on mobile (<768px) to reduce vertical space usage
 * - Desktop shows individual filter buttons instead
 * - Follows AircraftList filter dropdown pattern
 */
export function MapFiltersMenu({ filters }: MapFiltersMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Count active filters for badge
  const activeCount = filters.filter((f) => f.active).length;

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
    <div className="map-filters-menu" ref={menuRef}>
      <button
        type="button"
        className={`map-filters-menu__button ${isOpen ? "map-filters-menu__button--open" : ""}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-label="More filters"
        aria-expanded={isOpen}
      >
        <FontAwesomeIcon icon={faEllipsisV} />
        {activeCount > 0 && (
          <span className="map-filters-menu__badge">{activeCount}</span>
        )}
      </button>

      {isOpen && (
        <div className="map-filters-menu__dropdown">
          {filters.map((filter) => (
            <label key={filter.id} className="map-filters-menu__item">
              <FontAwesomeIcon
                icon={filter.icon}
                className="map-filters-menu__icon"
              />
              <span className="map-filters-menu__label">{filter.label}</span>
              <input
                type="checkbox"
                checked={filter.active}
                onChange={() => {
                  filter.onClick();
                }}
                aria-label={filter.label}
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
