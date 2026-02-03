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

import { NavLink } from "react-router-dom";
import acarsLogo from "../assets/images/acarshub.svg";
import {
  selectAdsbEnabled,
  selectUnreadAlertCount,
  useAppStore,
} from "../store/useAppStore";

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
  const adsbEnabled = useAppStore(selectAdsbEnabled);
  const unreadAlertCount = useAppStore(selectUnreadAlertCount);
  const systemHasError = useAppStore(selectSystemErrorState);
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen);

  const handleSettingsClick = () => {
    setSettingsOpen(true);
  };

  return (
    <header className="navigation">
      <div className="wrap">
        <span className="decor"></span>

        {/* Mobile menu */}
        <details className="show_when_small small_nav" id="menu_details">
          <summary className="menu_non_link">Menu</summary>
          <NavLink to="/live-messages">Live Messages</NavLink>
          <br />
          {adsbEnabled && (
            <>
              <NavLink to="/adsb">Live Map</NavLink>
              <br />
            </>
          )}
          <NavLink to="/search">Search Database</NavLink>
          <br />
          <NavLink to="/alerts">
            Alerts
            {unreadAlertCount > 0 && (
              <span className="alert-count"> ({unreadAlertCount})</span>
            )}
          </NavLink>
          <br />
          <NavLink to="/status">
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
    </header>
  );
};
