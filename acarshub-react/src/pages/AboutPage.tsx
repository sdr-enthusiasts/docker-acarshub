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
 * AboutPage Component
 * Displays information about ACARS Hub, help documentation, and version info
 *
 * This will be the first page fully implemented in Phase 3 as a proof-of-concept.
 */
export const AboutPage = () => {
  const setCurrentPage = useAppStore((state) => state.setCurrentPage);
  const version = useAppStore((state) => state.version);

  useEffect(() => {
    setCurrentPage("About");
    socketService.notifyPageChange("About");
  }, [setCurrentPage]);

  return (
    <div className="page about-page">
      <div className="page-header">
        <h1>About ACARS Hub</h1>
      </div>

      <div className="page-content">
        <div className="placeholder-message">
          <h2>About & Help</h2>
          <p>
            This page will display information about ACARS Hub, including help
            documentation, version information, and links to resources.
          </p>
          <p className="text-muted">
            Full implementation coming in Phase 3 of the React migration.
          </p>

          {version && (
            <div className="version-info">
              <h3>Version Information</h3>
              <p>
                <strong>Container Version:</strong> {version.container_version}
              </p>
              <p>
                <strong>GitHub Version:</strong> {version.github_version}
              </p>
              {version.is_outdated && (
                <p className="text-warning">
                  ⚠️ A newer version is available on GitHub
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
