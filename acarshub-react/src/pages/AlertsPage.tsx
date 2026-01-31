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

import { useEffect } from "react";
import { socketService } from "../services/socket";
import { useAppStore } from "../store/useAppStore";

/**
 * AlertsPage Component
 * Displays messages matching configured alert terms
 *
 * This is a placeholder for Phase 1. Full implementation will come in Phase 7.
 */
export const AlertsPage = () => {
  const setCurrentPage = useAppStore((state) => state.setCurrentPage);
  const alertTerms = useAppStore((state) => state.alertTerms);
  const alertCount = useAppStore((state) => state.alertCount);

  useEffect(() => {
    setCurrentPage("Alerts");
    socketService.notifyPageChange("Alerts");
  }, [setCurrentPage]);

  return (
    <div className="page alerts-page">
      <div className="page-header">
        <h1>Alerts</h1>
        <div className="page-stats">
          <span className="stat">
            <strong>{alertCount}</strong> matching messages
          </span>
        </div>
      </div>

      <div className="page-content">
        <div className="placeholder-message">
          <h2>Alerts View</h2>
          <p>
            This page will display messages matching your configured alert
            terms.
          </p>
          <p className="text-muted">
            Full implementation coming in Phase 7 of the React migration.
          </p>
          {alertTerms.terms.length > 0 && (
            <div className="debug-info">
              <h3>Current Alert Terms</h3>
              <ul>
                {alertTerms.terms.map((term) => (
                  <li key={term}>{term}</li>
                ))}
              </ul>
            </div>
          )}
          {alertTerms.ignore.length > 0 && (
            <div className="debug-info">
              <h3>Ignore Terms</h3>
              <ul>
                {alertTerms.ignore.map((term) => (
                  <li key={term}>{term}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
