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
import { NavLink, useLocation } from "react-router-dom";
import acarsLogo from "../assets/images/acarshub.svg";
import { getMessageFilterProps } from "../pages/LiveMessagesPage";
import {
  selectAdsbEnabled,
  selectUnreadAlertCount,
  useAppStore,
} from "../store/useAppStore";
import { MessageFilters } from "./MessageFilters";

/**
 * Selector for system error state
 */
const selectSystemErrorState = (
  state: ReturnType<typeof useAppStore.getState>,
) => state.systemStatus?.status.error_state ?? false;

import { ThemeSwitcher } from "./ThemeSwitcher";

/**
 * Navigation Component
 * Displays the main navigation menu with links to all pages
 * Conditionally shows ADS-B link based on decoder configuration
 */
export const Navigation = () => {
  const location = useLocation();
  const adsbEnabled = useAppStore(selectAdsbEnabled);
  const unreadAlertCount = useAppStore(selectUnreadAlertCount);
  const systemHasError = useAppStore(selectSystemErrorState);
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen);
  const menuDetailsRef = useRef<HTMLDetailsElement>(null);

  // Filter flyout state (for Live Messages page)
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterProps, setFilterProps] =
    useState<ReturnType<typeof getMessageFilterProps>>(null);

  // Check if we're on Live Messages page
  const isLiveMessagesPage = location.pathname === "/live-messages";

  // Listen for filter props updates
  useEffect(() => {
    if (!isLiveMessagesPage) {
      setFilterProps(null);
      return;
    }

    const updateFilterProps = () => {
      const props = getMessageFilterProps();
      setFilterProps(props);
    };

    // Update immediately
    updateFilterProps();

    // Listen for updates
    window.addEventListener("messageFiltersUpdate", updateFilterProps);

    return () => {
      window.removeEventListener("messageFiltersUpdate", updateFilterProps);
    };
  }, [isLiveMessagesPage]);

  const handleSettingsClick = () => {
    setSettingsOpen(true);
    // Close mobile menu if open
    if (menuDetailsRef.current) {
      menuDetailsRef.current.open = false;
    }
  };

  const handleMobileNavClick = () => {
    // Close mobile menu when a link is clicked
    if (menuDetailsRef.current) {
      menuDetailsRef.current.open = false;
    }
  };

  return (
    <header className="navigation">
      <div className="wrap">
        <span className="decor"></span>

        {/* Mobile navigation container */}
        <div className="show_when_small mobile_nav_container">
          {/* Mobile menu */}
          <details className="small_nav" id="menu_details" ref={menuDetailsRef}>
            <summary className="menu_non_link">Menu</summary>

            <NavLink to="/live-messages" onClick={handleMobileNavClick}>
              Live Messages
            </NavLink>
            <br />
            {adsbEnabled && (
              <>
                <NavLink to="/adsb" onClick={handleMobileNavClick}>
                  Live Map
                </NavLink>
                <br />
              </>
            )}
            <NavLink to="/search" onClick={handleMobileNavClick}>
              Search Database
            </NavLink>
            <br />
            <NavLink to="/alerts" onClick={handleMobileNavClick}>
              Alerts
              {unreadAlertCount > 0 && (
                <span className="alert-count"> ({unreadAlertCount})</span>
              )}
            </NavLink>
            <br />
            <NavLink to="/status" onClick={handleMobileNavClick}>
              Status
              {systemHasError && <span className="error-indicator"> ⚠</span>}
            </NavLink>
            <br />
            <button
              type="button"
              onClick={handleSettingsClick}
              className="link-button"
            >
              Settings
            </button>
          </details>

          {/* Filters button (mobile only, Live Messages page only) */}
          {isLiveMessagesPage && (
            <button
              type="button"
              onClick={() => setFiltersOpen(!filtersOpen)}
              className={`mobile_nav_button ${filtersOpen ? "active" : ""}`}
              aria-expanded={filtersOpen}
            >
              Filters
            </button>
          )}
        </div>

        {/* Desktop menu */}
        <nav className="hide_when_small">
          <ul className="primary">
            <li className="img_box" id="logo_image">
              <NavLink to="/about" className="logo-link">
                <img src={acarsLogo} alt="ACARS Hub" className="logo-image" />
                <span className="logo-text">ACARS Hub</span>
              </NavLink>
            </li>

            <li>
              <NavLink to="/live-messages">Live Messages</NavLink>
            </li>
            {adsbEnabled && (
              <li>
                <NavLink to="/adsb">Live Map</NavLink>
              </li>
            )}
            <li>
              <NavLink to="/search">Search Database</NavLink>
            </li>
            <li>
              <NavLink to="/alerts">
                Alerts
                {unreadAlertCount > 0 && (
                  <span className="alert-count"> ({unreadAlertCount})</span>
                )}
              </NavLink>
            </li>
            <li>
              <NavLink to="/status">
                Status
                {systemHasError && <span className="error-indicator"> ⚠</span>}
              </NavLink>
            </li>

            <li className="right_side">
              <ThemeSwitcher />
              <span id="modal_text">
                <button
                  type="button"
                  onClick={handleSettingsClick}
                  className="link-button"
                >
                  Settings
                </button>
              </span>
            </li>
          </ul>
        </nav>
      </div>

      {/* Filters flyout panel (mobile only) */}
      {isLiveMessagesPage && filtersOpen && (
        <div className="navigation__filters-flyout show_when_small">
          <div className="filters-flyout__header">
            <h3>Filters</h3>
            <button
              type="button"
              onClick={() => setFiltersOpen(false)}
              className="filters-flyout__close"
              aria-label="Close filters"
            >
              ✕
            </button>
          </div>
          <div className="filters-flyout__content">
            {filterProps && (
              <div className="filters-flyout__filters-wrapper">
                <MessageFilters
                  labels={filterProps.labels}
                  excludedLabels={filterProps.excludedLabels}
                  onExcludedLabelsChange={filterProps.onExcludedLabelsChange}
                  filterNoText={filterProps.filterNoText}
                  onFilterNoTextChange={filterProps.onFilterNoTextChange}
                  isPaused={filterProps.isPaused}
                  onPauseChange={filterProps.onPauseChange}
                  textFilter={filterProps.textFilter}
                  onTextFilterChange={filterProps.onTextFilterChange}
                  showAlertsOnly={filterProps.showAlertsOnly}
                  onShowAlertsOnlyChange={filterProps.onShowAlertsOnlyChange}
                  stationIds={filterProps.stationIds}
                  selectedStationIds={filterProps.selectedStationIds}
                  onSelectedStationIdsChange={
                    filterProps.onSelectedStationIdsChange
                  }
                />
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
