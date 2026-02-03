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

import { faMap } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useCallback, useEffect, useRef, useState } from "react";
import { GEOJSON_OVERLAYS } from "../../config/geojsonOverlays";
import { useSettingsStore } from "../../store/useSettingsStore";
import "./GeoJSONOverlayButton.scss";

// Stable empty array to prevent re-renders
const EMPTY_ARRAY: string[] = [];

/**
 * GeoJSONOverlayButton Component
 *
 * Dropdown button for selecting GeoJSON overlays to display on the map.
 * - Grouped by geographic category (United States, United Kingdom, Europe)
 * - Individual overlay checkboxes
 * - Category-level "toggle all" checkboxes
 * - Persistent selection via settings store
 */
export function GeoJSONOverlayButton() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const enabledOverlayIds = useSettingsStore(
    (state) => state.settings.map.enabledGeoJSONOverlays || EMPTY_ARRAY,
  );
  const toggleGeoJSONOverlay = useSettingsStore(
    (state) => state.toggleGeoJSONOverlay,
  );
  const setGeoJSONCategoryEnabled = useSettingsStore(
    (state) => state.setGeoJSONCategoryEnabled,
  );

  // Count enabled overlays for badge
  const enabledCount = enabledOverlayIds.length;

  // Check if any overlays are enabled (for active state)
  const hasEnabledOverlays = enabledCount > 0;

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Close dropdown on Escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  // Toggle dropdown
  const handleToggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  // Check if all overlays in a category are enabled
  const isCategoryEnabled = useCallback(
    (categoryName: string) => {
      const category = GEOJSON_OVERLAYS.find((c) => c.name === categoryName);
      if (!category) return false;

      const overlayIds = category.overlays.map((o) => o.id);
      return overlayIds.every((id) => enabledOverlayIds.includes(id));
    },
    [enabledOverlayIds],
  );

  // Check if some (but not all) overlays in a category are enabled
  const isCategoryIndeterminate = useCallback(
    (categoryName: string) => {
      const category = GEOJSON_OVERLAYS.find((c) => c.name === categoryName);
      if (!category) return false;

      const overlayIds = category.overlays.map((o) => o.id);
      const enabledInCategory = overlayIds.filter((id) =>
        enabledOverlayIds.includes(id),
      );
      return (
        enabledInCategory.length > 0 &&
        enabledInCategory.length < overlayIds.length
      );
    },
    [enabledOverlayIds],
  );

  return (
    <div className="geojson-overlay-button" ref={dropdownRef}>
      <button
        type="button"
        className={`map-control-button ${hasEnabledOverlays ? "map-control-button--active" : ""}`}
        onClick={handleToggle}
        aria-label="GeoJSON Overlays"
        aria-expanded={isOpen}
        title="GeoJSON Overlays"
      >
        <FontAwesomeIcon icon={faMap} />
        {enabledCount > 0 && (
          <span className="geojson-overlay-button__badge">{enabledCount}</span>
        )}
      </button>

      {isOpen && (
        <div className="geojson-overlay-dropdown">
          <div className="geojson-overlay-dropdown__header">
            GeoJSON Overlays
          </div>

          <div className="geojson-overlay-dropdown__content">
            {GEOJSON_OVERLAYS.map((category) => (
              <div key={category.name} className="overlay-category">
                <div className="overlay-category__header">
                  <label className="overlay-category__label">
                    <input
                      type="checkbox"
                      checked={isCategoryEnabled(category.name)}
                      ref={(el) => {
                        if (el) {
                          el.indeterminate = isCategoryIndeterminate(
                            category.name,
                          );
                        }
                      }}
                      onChange={(e) =>
                        setGeoJSONCategoryEnabled(
                          category.name,
                          e.target.checked,
                        )
                      }
                      aria-label={`Toggle all ${category.name} overlays`}
                    />
                    <span className="overlay-category__name">
                      {category.name}
                    </span>
                  </label>
                </div>

                <div className="overlay-category__overlays">
                  {category.overlays.map((overlay) => (
                    <label
                      key={overlay.id}
                      className="overlay-item"
                      title={overlay.name}
                    >
                      <input
                        type="checkbox"
                        checked={enabledOverlayIds.includes(overlay.id)}
                        onChange={() => toggleGeoJSONOverlay(overlay.id)}
                        aria-label={overlay.name}
                      />
                      <span
                        className="overlay-item__color"
                        style={{ backgroundColor: overlay.color }}
                        aria-hidden="true"
                      />
                      <span className="overlay-item__name">{overlay.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
