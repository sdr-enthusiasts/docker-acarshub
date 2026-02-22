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

import { faChevronDown } from "@fortawesome/free-solid-svg-icons/faChevronDown";
import { faFilter } from "@fortawesome/free-solid-svg-icons/faFilter";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "../../store/useAppStore";
import { useSettingsStore } from "../../store/useSettingsStore";
import type { PairedAircraft } from "../../utils/aircraftPairing";
import {
  formatAltitude,
  formatGroundSpeed,
  getDisplayCallsign,
} from "../../utils/aircraftPairing";
import type { ViewportBounds } from "./AircraftMarkers";
import "../../styles/components/_aircraft-list.scss";

interface AircraftListProps {
  aircraft: PairedAircraft[];
  onAircraftClick?: (aircraft: PairedAircraft) => void;
  onAircraftHover?: (aircraft: PairedAircraft | null) => void;
  hoveredAircraft?: string | null; // hex of hovered aircraft
  /** Whether updates are paused */
  isPaused?: boolean;
  /** Callback when pause button is clicked */
  onPauseToggle?: () => void;
  /**
   * Current map viewport bounds (exact, unbuffered).
   * When provided, enables the "Visible Only" filter which restricts the list
   * to aircraft whose position falls within the visible map area.
   */
  viewportBounds?: ViewportBounds | null;
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
  isPaused = false,
  onPauseToggle,
  viewportBounds,
}: AircraftListProps) {
  const altitudeUnit = useSettingsStore(
    (state) => state.settings.regional.altitudeUnit,
  );
  const readMessageUids = useAppStore((state) => state.readMessageUids);
  const markAllMessagesAsRead = useAppStore(
    (state) => state.markAllMessagesAsRead,
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

  const [showUnreadOnly, setShowUnreadOnly] = useState(() => {
    const saved = localStorage.getItem("aircraftList.showUnreadOnly");
    return saved === "true";
  });

  const [showMilitaryOnly, setShowMilitaryOnly] = useState(() => {
    const saved = localStorage.getItem("aircraftList.showMilitaryOnly");
    return saved === "true";
  });

  const [showInterestingOnly, setShowInterestingOnly] = useState(() => {
    const saved = localStorage.getItem("aircraftList.showInterestingOnly");
    return saved === "true";
  });

  const [showPIAOnly, setShowPIAOnly] = useState(() => {
    const saved = localStorage.getItem("aircraftList.showPIAOnly");
    return saved === "true";
  });

  const [showLADDOnly, setShowLADDOnly] = useState(() => {
    const saved = localStorage.getItem("aircraftList.showLADDOnly");
    return saved === "true";
  });

  const [showVisibleOnly, setShowVisibleOnly] = useState(() => {
    const saved = localStorage.getItem("aircraftList.showVisibleOnly");
    return saved === "true";
  });

  const [filterDropdownOpen, setFilterDropdownOpen] = useState(false);
  const filterDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        filterDropdownRef.current &&
        !filterDropdownRef.current.contains(event.target as Node)
      ) {
        setFilterDropdownOpen(false);
      }
    };

    if (filterDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [filterDropdownOpen]);

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
    // If enabling ACARS filter, disable Unread filter (mutually exclusive)
    if (value && showUnreadOnly) {
      setShowUnreadOnly(false);
      localStorage.setItem("aircraftList.showUnreadOnly", "false");
    }
    localStorage.setItem("aircraftList.showAcarsOnly", String(value));
  };

  const handleShowAlertsOnlyChange = (value: boolean) => {
    setShowAlertsOnly(value);
    localStorage.setItem("aircraftList.showAlertsOnly", String(value));
  };

  const handleShowUnreadOnlyChange = (value: boolean) => {
    setShowUnreadOnly(value);
    // If enabling Unread filter, disable ACARS filter (mutually exclusive)
    if (value && showAcarsOnly) {
      setShowAcarsOnly(false);
      localStorage.setItem("aircraftList.showAcarsOnly", "false");
    }
    localStorage.setItem("aircraftList.showUnreadOnly", String(value));
  };

  const handleShowMilitaryOnlyChange = (value: boolean) => {
    setShowMilitaryOnly(value);
    localStorage.setItem("aircraftList.showMilitaryOnly", String(value));
  };

  const handleShowInterestingOnlyChange = (value: boolean) => {
    setShowInterestingOnly(value);
    localStorage.setItem("aircraftList.showInterestingOnly", String(value));
  };

  const handleShowPIAOnlyChange = (value: boolean) => {
    setShowPIAOnly(value);
    localStorage.setItem("aircraftList.showPIAOnly", String(value));
  };

  const handleShowLADDOnlyChange = (value: boolean) => {
    setShowLADDOnly(value);
    localStorage.setItem("aircraftList.showLADDOnly", String(value));
  };

  const handleShowVisibleOnlyChange = (value: boolean) => {
    setShowVisibleOnly(value);
    localStorage.setItem("aircraftList.showVisibleOnly", String(value));
  };

  const handleMarkAllAsRead = () => {
    markAllMessagesAsRead();
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

  // Calculate total unread messages
  const totalUnreadCount = useMemo(() => {
    let count = 0;
    for (const a of aircraft) {
      if (a.matchedGroup) {
        for (const msg of a.matchedGroup.messages) {
          if (!readMessageUids.has(msg.uid)) {
            count++;
          }
        }
      }
    }
    return count;
  }, [aircraft, readMessageUids]);

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

    // ACARS filters (mutually exclusive: only one should be active at a time)
    // If ACARS-only filter is enabled
    if (showAcarsOnly) {
      filtered = filtered.filter((a) => a.hasMessages);
    }
    // If Unread-only filter is enabled (mutually exclusive with ACARS-only)
    else if (showUnreadOnly) {
      filtered = filtered.filter((a) => {
        if (!a.matchedGroup) return false;
        return a.matchedGroup.messages.some(
          (msg) => !readMessageUids.has(msg.uid),
        );
      });
    }

    // Alerts-only filter (independent)
    if (showAlertsOnly) {
      filtered = filtered.filter((a) => a.hasAlerts);
    }

    // dbFlags filters (additive: aircraft matching ANY of these should be shown)
    const hasDbFlagsFilters =
      showMilitaryOnly || showInterestingOnly || showPIAOnly || showLADDOnly;

    if (hasDbFlagsFilters) {
      filtered = filtered.filter((a) => {
        if (a.dbFlags === undefined || a.dbFlags === null) return false;
        const flags =
          typeof a.dbFlags === "string" ? parseInt(a.dbFlags, 10) : a.dbFlags;
        if (Number.isNaN(flags)) return false;

        // Check if aircraft matches ANY of the enabled dbFlags filters
        return (
          (showMilitaryOnly && (flags & 1) !== 0) ||
          (showInterestingOnly && (flags & 2) !== 0) ||
          (showPIAOnly && (flags & 4) !== 0) ||
          (showLADDOnly && (flags & 8) !== 0)
        );
      });
    }

    // Visible-only filter: restrict list to aircraft inside the current
    // map viewport.  Aircraft without a position are always excluded when
    // this filter is active because they cannot be "on screen".
    // The bounds are exact (no buffer) so the list reflects precisely what
    // the user can see.  When viewportBounds is null (map not yet loaded)
    // the filter is skipped gracefully.
    if (showVisibleOnly && viewportBounds) {
      filtered = filtered.filter((a) => {
        if (a.lat === undefined || a.lon === undefined) return false;

        const inLat =
          a.lat >= viewportBounds.south && a.lat <= viewportBounds.north;

        // Handle antimeridian crossing: when west > east the viewport wraps
        // around the ±180° line.
        const inLng =
          viewportBounds.east >= viewportBounds.west
            ? a.lon >= viewportBounds.west && a.lon <= viewportBounds.east
            : a.lon >= viewportBounds.west || a.lon <= viewportBounds.east;

        return inLat && inLng;
      });
    }

    return filtered;
  }, [
    aircraft,
    textFilter,
    showAcarsOnly,
    showAlertsOnly,
    showUnreadOnly,
    showMilitaryOnly,
    showInterestingOnly,
    showPIAOnly,
    showLADDOnly,
    showVisibleOnly,
    viewportBounds,
    readMessageUids,
  ]);

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
        case "altitude": {
          // Special handling for altitude: N/A, Ground, and numeric values
          // Descending: highest → lowest → ground → N/A
          // Ascending: ground → lowest → highest → N/A
          const getAltitudeSortValue = (
            alt?: number | "ground",
            direction?: SortDirection,
          ): number => {
            if (alt === undefined || alt === null) {
              // N/A always goes last regardless of sort direction
              return direction === "asc"
                ? Number.MAX_SAFE_INTEGER
                : Number.MIN_SAFE_INTEGER;
            }
            if (alt === "ground" || alt === 0) {
              // Ground goes before numeric altitudes in asc, after in desc
              return direction === "asc" ? -1 : Number.MIN_SAFE_INTEGER + 1;
            }
            return alt; // Numeric altitude
          };
          aVal = getAltitudeSortValue(a.alt_baro, sortDirection);
          bVal = getAltitudeSortValue(b.alt_baro, sortDirection);
          break;
        }
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
    setShowUnreadOnly(false);
    setShowMilitaryOnly(false);
    setShowInterestingOnly(false);
    setShowPIAOnly(false);
    setShowLADDOnly(false);
    setShowVisibleOnly(false);
    localStorage.removeItem("aircraftList.textFilter");
    localStorage.removeItem("aircraftList.showAcarsOnly");
    localStorage.removeItem("aircraftList.showAlertsOnly");
    localStorage.removeItem("aircraftList.showUnreadOnly");
    localStorage.removeItem("aircraftList.showMilitaryOnly");
    localStorage.removeItem("aircraftList.showInterestingOnly");
    localStorage.removeItem("aircraftList.showPIAOnly");
    localStorage.removeItem("aircraftList.showLADDOnly");
    localStorage.removeItem("aircraftList.showVisibleOnly");
  };

  const hasActiveFilters =
    textFilter ||
    showAcarsOnly ||
    showAlertsOnly ||
    showUnreadOnly ||
    showMilitaryOnly ||
    showInterestingOnly ||
    showPIAOnly ||
    showLADDOnly ||
    showVisibleOnly;

  const activeFilterCount = [
    showAcarsOnly,
    showAlertsOnly,
    showUnreadOnly,
    showMilitaryOnly,
    showInterestingOnly,
    showPIAOnly,
    showLADDOnly,
    showVisibleOnly,
  ].filter(Boolean).length;

  return (
    <div className="aircraft-list">
      {/* Header with stats and pause button */}
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
        {onPauseToggle && (
          <button
            type="button"
            className={`aircraft-list__pause-button ${isPaused ? "aircraft-list__pause-button--paused" : ""}`}
            onClick={onPauseToggle}
            title={
              isPaused
                ? "Resume updates (or press 'p')"
                : "Pause updates (or press 'p')"
            }
          >
            {isPaused ? "▶" : "⏸"}
          </button>
        )}
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

        <div className="aircraft-list__filter-dropdown" ref={filterDropdownRef}>
          <button
            type="button"
            className={`aircraft-list__filter-button ${filterDropdownOpen ? "aircraft-list__filter-button--open" : ""}`}
            onClick={() => setFilterDropdownOpen(!filterDropdownOpen)}
            aria-label="Filter aircraft"
            aria-expanded={filterDropdownOpen}
          >
            <FontAwesomeIcon icon={faFilter} />
            <span>Filters</span>
            {activeFilterCount > 0 && (
              <span className="aircraft-list__filter-badge">
                {activeFilterCount}
              </span>
            )}
            <FontAwesomeIcon
              icon={faChevronDown}
              className="aircraft-list__filter-chevron"
            />
          </button>

          {filterDropdownOpen && (
            <div className="aircraft-list__filter-menu">
              <label className="aircraft-list__filter-toggle">
                <input
                  type="checkbox"
                  checked={showAcarsOnly}
                  onChange={(e) => handleShowAcarsOnlyChange(e.target.checked)}
                />
                <span>ACARS Messages</span>
              </label>

              <label className="aircraft-list__filter-toggle">
                <input
                  type="checkbox"
                  checked={showAlertsOnly}
                  onChange={(e) => handleShowAlertsOnlyChange(e.target.checked)}
                />
                <span>Alerts Only</span>
              </label>

              <label className="aircraft-list__filter-toggle">
                <input
                  type="checkbox"
                  checked={showUnreadOnly}
                  onChange={(e) => handleShowUnreadOnlyChange(e.target.checked)}
                />
                <span>Unread Messages</span>
              </label>

              <label className="aircraft-list__filter-toggle">
                <input
                  type="checkbox"
                  checked={showMilitaryOnly}
                  onChange={(e) =>
                    handleShowMilitaryOnlyChange(e.target.checked)
                  }
                />
                <span>Military Aircraft</span>
              </label>

              <label className="aircraft-list__filter-toggle">
                <input
                  type="checkbox"
                  checked={showInterestingOnly}
                  onChange={(e) =>
                    handleShowInterestingOnlyChange(e.target.checked)
                  }
                />
                <span>Interesting Aircraft</span>
              </label>

              <label className="aircraft-list__filter-toggle">
                <input
                  type="checkbox"
                  checked={showPIAOnly}
                  onChange={(e) => handleShowPIAOnlyChange(e.target.checked)}
                />
                <span>PIA Aircraft</span>
              </label>

              <label className="aircraft-list__filter-toggle">
                <input
                  type="checkbox"
                  checked={showLADDOnly}
                  onChange={(e) => handleShowLADDOnlyChange(e.target.checked)}
                />
                <span>LADD Aircraft</span>
              </label>

              <div className="aircraft-list__filter-divider" />

              <label
                className={`aircraft-list__filter-toggle ${!viewportBounds ? "aircraft-list__filter-toggle--disabled" : ""}`}
                title={
                  !viewportBounds
                    ? "Available once the map has loaded"
                    : "Show only aircraft currently visible on the map"
                }
              >
                <input
                  type="checkbox"
                  checked={showVisibleOnly}
                  disabled={!viewportBounds}
                  onChange={(e) =>
                    handleShowVisibleOnlyChange(e.target.checked)
                  }
                  aria-label="Visible Only"
                />
                <span>Visible Only</span>
              </label>

              {hasActiveFilters && (
                <>
                  <div className="aircraft-list__filter-divider" />
                  <button
                    type="button"
                    className="aircraft-list__filter-clear"
                    onClick={() => {
                      handleClearFilters();
                      setFilterDropdownOpen(false);
                    }}
                  >
                    Clear All Filters
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        <div className="aircraft-list__actions">
          {totalUnreadCount > 0 && (
            <button
              type="button"
              className="aircraft-list__mark-all-read"
              onClick={handleMarkAllAsRead}
              title={`Mark ${totalUnreadCount} message${totalUnreadCount === 1 ? "" : "s"} as read`}
            >
              Mark All Read ({totalUnreadCount})
            </button>
          )}

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
