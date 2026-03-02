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

/**
 * MigrationStatus Component
 *
 * Shown as a banner below the navigation when the backend is running database
 * migrations at startup.  Clients that connect before migrations complete
 * receive a `migration_status { running: true }` Socket.IO event which sets
 * `migrationInProgress` in the app store — this component reads that flag.
 *
 * The banner is dismissed automatically when either:
 *   a) `migration_status { running: false }` is received (explicit signal from
 *      the backend after all init is complete and the deferred connect sequence
 *      has been delivered), or
 *   b) `features_enabled` is received (handles reconnects where the client
 *      timed out during a long migration and never saw the { running: false }
 *      signal).
 */

import { useAppStore } from "../store/useAppStore";

/**
 * MigrationStatus Component
 *
 * Displays an informational banner while the backend is running DB migrations.
 * Hidden when migrationInProgress is false.
 */
export const MigrationStatus = () => {
  const migrationInProgress = useAppStore((state) => state.migrationInProgress);

  if (!migrationInProgress) {
    return null;
  }

  return (
    <output
      className="migration-status"
      aria-live="polite"
      aria-label="Database migration in progress"
    >
      <div className="migration-status__content">
        <span className="migration-status__spinner" aria-hidden="true" />
        <div className="migration-status__text-group">
          <span className="migration-status__title">
            Database migration in progress
          </span>
          <span className="migration-status__detail">
            This is a one-time operation after an upgrade. It may take several
            minutes on large databases. Live messages will appear once complete.
          </span>
        </div>
      </div>
    </output>
  );
};
