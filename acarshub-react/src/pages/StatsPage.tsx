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
 * StatsPage Component
 * Displays statistics and graphs for ACARS message reception
 *
 * This is a placeholder for Phase 1. Full implementation will come in Phase 4.
 */
export const StatsPage = () => {
  const setCurrentPage = useAppStore((state) => state.setCurrentPage);
  const systemStatus = useAppStore((state) => state.systemStatus);

  useEffect(() => {
    setCurrentPage("Statistics");
    socketService.notifyPageChange("Statistics");
  }, [setCurrentPage]);

  return (
    <div className="page stats-page">
      <div className="page-header">
        <h1>Statistics</h1>
      </div>

      <div className="page-content">
        <div className="placeholder-message">
          <h2>Statistics Dashboard</h2>
          <p>This page will display charts and graphs showing:</p>
          <ul>
            <li>Message reception rates over time</li>
            <li>Decoder performance metrics</li>
            <li>Signal level distributions</li>
            <li>Frequency usage statistics</li>
            <li>Aircraft activity trends</li>
          </ul>
          <p className="text-muted">
            Full implementation coming in Phase 4 of the React migration.
          </p>
          {systemStatus && (
            <div className="debug-info">
              <h3>Debug: System Status Available</h3>
              <p>
                Error state: {systemStatus.status.error_state ? "Yes" : "No"}
              </p>
              <p>
                Decoder count:{" "}
                {Object.keys(systemStatus.status.decoders).length}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
