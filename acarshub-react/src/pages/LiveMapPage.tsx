// Copyright (C) 2022-2024 Frederick Clausen II
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

import { useEffect } from "react";
import { socketService } from "../services/socket";
import { useAppStore } from "../store/useAppStore";

/**
 * LiveMapPage Component
 * Displays real-time aircraft positions on a map using ADS-B data
 *
 * This is a placeholder for Phase 1. Full implementation will come in Phase 5.
 */
export const LiveMapPage = () => {
  const setCurrentPage = useAppStore((state) => state.setCurrentPage);
  const adsbStatus = useAppStore((state) => state.adsbStatus);

  useEffect(() => {
    setCurrentPage("Live Map");
    socketService.notifyPageChange("Live Map");
  }, [setCurrentPage]);

  return (
    <div className="page live-map-page">
      <div className="page-header">
        <h1>Live Map</h1>
      </div>

      <div className="page-content">
        <div className="placeholder-message">
          <h2>Aircraft Map View</h2>
          <p>
            This page will display real-time aircraft positions on an
            interactive map.
          </p>
          <p className="text-muted">
            Full implementation coming in Phase 5 of the React migration.
          </p>
          {adsbStatus && (
            <div className="debug-info">
              <h3>Debug: ADS-B Status</h3>
              <p>ADS-B Enabled: {adsbStatus.adsb_enabled ? "Yes" : "No"}</p>
              <p>Getting Data: {adsbStatus.adsb_getting_data ? "Yes" : "No"}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
