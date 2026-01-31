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
 * SearchPage Component
 * Provides database search functionality for historical ACARS messages
 *
 * This is a placeholder for Phase 1. Full implementation will come in Phase 7.
 */
export const SearchPage = () => {
  const setCurrentPage = useAppStore((state) => state.setCurrentPage);
  const databaseSize = useAppStore((state) => state.databaseSize);

  useEffect(() => {
    setCurrentPage("Search");
    socketService.notifyPageChange("Search");
  }, [setCurrentPage]);

  return (
    <div className="page search-page">
      <div className="page-header">
        <h1>Search Database</h1>
        {databaseSize && (
          <div className="page-stats">
            <span className="stat">
              <strong>{databaseSize.count.toLocaleString()}</strong> messages
            </span>
            <span className="stat">
              <strong>{databaseSize.size}</strong> database size
            </span>
          </div>
        )}
      </div>

      <div className="page-content">
        <div className="placeholder-message">
          <h2>Database Search</h2>
          <p>This page will allow searching historical ACARS messages by:</p>
          <ul>
            <li>Flight number</li>
            <li>Aircraft tail number</li>
            <li>ICAO address</li>
            <li>Departure/destination airports</li>
            <li>Frequency</li>
            <li>Message label</li>
            <li>Message text content</li>
            <li>Station ID</li>
          </ul>
          <p className="text-muted">
            Full implementation coming in Phase 7 of the React migration.
          </p>
        </div>
      </div>
    </div>
  );
};
