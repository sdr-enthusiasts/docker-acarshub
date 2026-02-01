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
import { useSettingsStore } from "../../store/useSettingsStore";
import type { PairedAircraft } from "../../utils/aircraftPairing";
import {
  formatAltitude,
  formatGroundSpeed,
  getDisplayCallsign,
} from "../../utils/aircraftPairing";
import "../../styles/components/_aircraft-list.scss";

interface AircraftListProps {
  aircraft: PairedAircraft[];
  onAircraftClick?: (aircraft: PairedAircraft) => void;
  onAircraftHover?: (aircraft: PairedAircraft | null) => void;
  hoveredAircraft?: string | null; // hex of hovered aircraft
}

type SortField =
  | "callsign"
  | "altitude"
  | "speed"
  | "messages"
  | "alerts"
  | "distance";
type SortDirection = "asc" | "desc";

/**
 * AircraftList Component
 *
 * Displays a sortable, filterable list of aircraft positions
 * - Multiple sort fields (callsign, altitude, speed, messages, alerts)
 * - Text filtering across all fields
 * - Filter options (ACARS-only, alerts-only)
 * - Hover sync with map markers
 * - Click to center map or open messages
 * - Mobile-responsive with collapse/expand
 *
 * Design Notes:
 * - Shares PairedAircraft data with AircraftMarkers
 * - Sort/filter preferences persist to localStorage
 * - Theme-aware with Catppuccin colors
 * - Virtualization not needed (typically <200 aircraft)
 */
export function AircraftList({
  aircraft,
  onAircraftClick,
  onAircraftHover,
  hoveredAircraft,
}: AircraftListProps) {
  const altitudeUnit = useSettingsStore(
    (state) => state.settings.regional.altitudeUnit,
  );

  // Filter and sort state (persisted to localStorage)
  const [textFilter, setTextFilter] = useState(() => {
    return localStorage.getItem("aircraftList.textFilter") || "";
  });

  const [showAcarsOnly, setShowAcarsOnly] = useState(() => {
    const saved = localStorage.getItem("aircraftList.showAcarsOnly");
    return saved === "true";
  });

  const [showAlertsOnly, setShowAlertsOnly] = useState(() => {
    const saved = localStorage.getItem("aircraftList.showAlertsOnly");
    return saved === "true";
  });

  const [sortField, setSortField] = useState<SortField>(() => {
    return (
      (localStorage.getItem("aircraftList.sortField") as SortField) ||
      "callsign"
    );
  });

  const [sortDirection, setSortDirection] = useState<SortDirection>(() => {
    return (
      (localStorage.getItem("aircraftList.sortDirection") as SortDirection) ||
      "asc"
    );
  });

  // Persist filter/sort preferences
  const handleTextFilterChange = (value: string) => {
    setTextFilter(value);
    localStorage.setItem("aircraftList.textFilter", value);
  };

  const handleShowAcarsOnlyChange = (value: boolean) => {
    setShowAcarsOnly(value);
    localStorage.setItem("aircraftList.showAcarsOnly", String(value));
  };

  const handleShowAlertsOnlyChange = (value: boolean) => {
    setShowAlertsOnly(value);
    localStorage.setItem("aircraftList.showAlertsOnly", String(value));
  };

  const handleSortChange = (field: SortField) => {
    if (sortField === field) {
      // Toggle direction if same field
      const newDirection = sortDirection === "asc" ? "desc" : "asc";
      setSortDirection(newDirection);
      localStorage.setItem("aircraftList.sortDirection", newDirection);
    } else {
      // New field, default to ascending
      setSortField(field);
      setSortDirection("asc");
      localStorage.setItem("aircraftList.sortField", field);
      localStorage.setItem("aircraftList.sortDirection", "asc");
    }
  };

  // Filter aircraft
  const filteredAircraft = useMemo(() => {
    let filtered = aircraft;

    // Text filter
    if (textFilter) {
      const filterLower = textFilter.toLowerCase();
      filtered = filtered.filter((a) => {
        const callsign = getDisplayCallsign(a).toLowerCase();
        const hex = a.hex.toLowerCase();
        const tail = a.tail?.toLowerCase() || "";
        const type = a.type?.toLowerCase() || "";

        return (
          callsign.includes(filterLower) ||
          hex.includes(filterLower) ||
          tail.includes(filterLower) ||
          type.includes(filterLower)
        );
      });
    }

    // ACARS-only filter
    if (showAcarsOnly) {
      filtered = filtered.filter((a) => a.hasMessages);
    }

    // Alerts-only filter
    if (showAlertsOnly) {
      filtered = filtered.filter((a) => a.hasAlerts);
    }

    return filtered;
  }, [aircraft, textFilter, showAcarsOnly, showAlertsOnly]);

  // Sort aircraft
  const sortedAircraft = useMemo(() => {
    const sorted = [...filteredAircraft];

    sorted.sort((a, b) => {
      let aVal: string | number = 0;
      let bVal: string | number = 0;

      switch (sortField) {
        case "callsign":
          aVal = getDisplayCallsign(a);
          bVal = getDisplayCallsign(b);
          break;
        case "altitude":
          aVal = a.alt_baro ?? -9999;
          bVal = b.alt_baro ?? -9999;
          break;
        case "speed":
          aVal = a.gs ?? -1;
          bVal = b.gs ?? -1;
          break;
        case "messages":
          aVal = a.messageCount;
          bVal = b.messageCount;
          break;
        case "alerts":
          aVal = a.alertCount;
          bVal = b.alertCount;
          break;
        case "distance":
          // TODO: Calculate distance from station when station location available
          aVal = 0;
          bVal = 0;
          break;
      }

      // String comparison
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDirection === "asc"
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }

      // Numeric comparison (type assertion safe because we know it's not string)
      const aNum = aVal as number;
      const bNum = bVal as number;
      return sortDirection === "asc" ? aNum - bNum : bNum - aNum;
    });

    return sorted;
  }, [filteredAircraft, sortField, sortDirection]);

  // Clear all filters
  const handleClearFilters = () => {
    setTextFilter("");
    setShowAcarsOnly(false);
    setShowAlertsOnly(false);
    localStorage.removeItem("aircraftList.textFilter");
    localStorage.removeItem("aircraftList.showAcarsOnly");
    localStorage.removeItem("aircraftList.showAlertsOnly");
  };

  const hasActiveFilters = textFilter || showAcarsOnly || showAlertsOnly;

  return (
    <div className="aircraft-list">
      {/* Header with stats */}
      <div className="aircraft-list__header">
        <div className="aircraft-list__stats">
          <span className="aircraft-list__stat">
            <strong>{sortedAircraft.length}</strong>{" "}
            {sortedAircraft.length === 1 ? "aircraft" : "aircraft"}
          </span>
          {aircraft.length !== sortedAircraft.length && (
            <span className="aircraft-list__stat aircraft-list__stat--muted">
              ({aircraft.length} total)
            </span>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="aircraft-list__filters">
        <input
          type="text"
          className="aircraft-list__search"
          placeholder="Search callsign, hex, tail, type..."
          value={textFilter}
          onChange={(e) => handleTextFilterChange(e.target.value)}
        />

        <div className="aircraft-list__filter-toggles">
          <label className="aircraft-list__filter-toggle">
            <input
              type="checkbox"
              checked={showAcarsOnly}
              onChange={(e) => handleShowAcarsOnlyChange(e.target.checked)}
            />
            <span>ACARS Only</span>
          </label>

          <label className="aircraft-list__filter-toggle">
            <input
              type="checkbox"
              checked={showAlertsOnly}
              onChange={(e) => handleShowAlertsOnlyChange(e.target.checked)}
            />
            <span>Alerts Only</span>
          </label>
        </div>

        {hasActiveFilters && (
          <button
            type="button"
            className="aircraft-list__clear-filters"
            onClick={handleClearFilters}
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Aircraft table */}
      <div className="aircraft-list__table-container">
        {sortedAircraft.length === 0 ? (
          <div className="aircraft-list__empty">
            <p>No aircraft found</p>
            {hasActiveFilters && (
              <button
                type="button"
                className="aircraft-list__clear-filters"
                onClick={handleClearFilters}
              >
                Clear Filters
              </button>
            )}
          </div>
        ) : (
          <table className="aircraft-list__table">
            <thead>
              <tr>
                <th>
                  <button
                    type="button"
                    className={`aircraft-list__sort-button ${
                      sortField === "callsign"
                        ? "aircraft-list__sort-button--active"
                        : ""
                    }`}
                    onClick={() => handleSortChange("callsign")}
                  >
                    Callsign
                    {sortField === "callsign" && (
                      <span className="aircraft-list__sort-icon">
                        {sortDirection === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                  </button>
                </th>
                <th>
                  <button
                    type="button"
                    className={`aircraft-list__sort-button ${
                      sortField === "altitude"
                        ? "aircraft-list__sort-button--active"
                        : ""
                    }`}
                    onClick={() => handleSortChange("altitude")}
                  >
                    Altitude
                    {sortField === "altitude" && (
                      <span className="aircraft-list__sort-icon">
                        {sortDirection === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                  </button>
                </th>
                <th>
                  <button
                    type="button"
                    className={`aircraft-list__sort-button ${
                      sortField === "speed"
                        ? "aircraft-list__sort-button--active"
                        : ""
                    }`}
                    onClick={() => handleSortChange("speed")}
                  >
                    Speed
                    {sortField === "speed" && (
                      <span className="aircraft-list__sort-icon">
                        {sortDirection === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                  </button>
                </th>
                <th>
                  <button
                    type="button"
                    className={`aircraft-list__sort-button ${
                      sortField === "messages"
                        ? "aircraft-list__sort-button--active"
                        : ""
                    }`}
                    onClick={() => handleSortChange("messages")}
                    title="Messages"
                  >
                    #
                    {sortField === "messages" && (
                      <span className="aircraft-list__sort-icon">
                        {sortDirection === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                  </button>
                </th>
                <th>
                  <button
                    type="button"
                    className={`aircraft-list__sort-button ${
                      sortField === "alerts"
                        ? "aircraft-list__sort-button--active"
                        : ""
                    }`}
                    onClick={() => handleSortChange("alerts")}
                    title="Alerts"
                  >
                    #
                    {sortField === "alerts" && (
                      <span className="aircraft-list__sort-icon">
                        {sortDirection === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedAircraft.map((a) => (
                <tr
                  key={a.hex}
                  className={`aircraft-list__row ${
                    hoveredAircraft === a.hex
                      ? "aircraft-list__row--hovered"
                      : ""
                  } ${a.hasAlerts ? "aircraft-list__row--alert" : ""}`}
                  onClick={() => onAircraftClick?.(a)}
                  onMouseEnter={() => onAircraftHover?.(a)}
                  onMouseLeave={() => onAircraftHover?.(null)}
                >
                  <td className="aircraft-list__callsign">
                    {getDisplayCallsign(a)}
                    {a.hasMessages && (
                      <span
                        className="aircraft-list__badge aircraft-list__badge--messages"
                        title="Has ACARS messages"
                      >
                        ✓
                      </span>
                    )}
                  </td>
                  <td className="aircraft-list__altitude">
                    {formatAltitude(a.alt_baro, altitudeUnit)}
                  </td>
                  <td className="aircraft-list__speed">
                    {formatGroundSpeed(a.gs)}
                  </td>
                  <td className="aircraft-list__messages">
                    {a.messageCount > 0 ? a.messageCount : "—"}
                  </td>
                  <td className="aircraft-list__alerts">
                    {a.alertCount > 0 ? (
                      <span className="aircraft-list__alert-count">
                        {a.alertCount}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
