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

import { faQuestionCircle, faTimes } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useState } from "react";

/**
 * MapLegend Component
 *
 * Displays a legend explaining aircraft icon colors on the map.
 * - Toggle button shows/hides the legend
 * - Color swatches match actual aircraft marker colors
 * - Positioned in bottom-left corner
 * - Mobile-friendly with responsive layout
 */
export function MapLegend() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="map-legend">
      {/* Toggle button */}
      <button
        type="button"
        className="map-legend__toggle"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={isOpen ? "Hide legend" : "Show legend"}
        aria-expanded={isOpen}
      >
        <FontAwesomeIcon icon={faQuestionCircle} />
      </button>

      {/* Legend panel */}
      {isOpen && (
        <div className="map-legend__panel">
          <div className="map-legend__header">
            <h3 className="map-legend__title">Aircraft Colors</h3>
            <button
              type="button"
              className="map-legend__close"
              onClick={() => setIsOpen(false)}
              aria-label="Close legend"
            >
              <FontAwesomeIcon icon={faTimes} />
            </button>
          </div>

          <div className="map-legend__content">
            <div className="map-legend__item">
              <span
                className="map-legend__swatch map-legend__swatch--alert"
                aria-hidden="true"
              />
              <span className="map-legend__label">Aircraft with alerts</span>
            </div>

            <div className="map-legend__item">
              <span
                className="map-legend__swatch map-legend__swatch--messages"
                aria-hidden="true"
              />
              <span className="map-legend__label">
                Aircraft with ACARS messages
              </span>
            </div>

            <div className="map-legend__item">
              <span
                className="map-legend__swatch map-legend__swatch--ground"
                aria-hidden="true"
              />
              <span className="map-legend__label">
                Aircraft on ground (&lt;500 ft)
              </span>
            </div>

            <div className="map-legend__item">
              <span
                className="map-legend__swatch map-legend__swatch--default"
                aria-hidden="true"
              />
              <span className="map-legend__label">
                Aircraft with no messages
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
