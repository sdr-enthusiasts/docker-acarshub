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

interface ConnectionStatusProps {
  isConnected: boolean;
}

/**
 * ConnectionStatus Component
 * Displays a visual indicator of the Socket.IO connection state
 * Shows a warning banner when disconnected from the backend
 */
export const ConnectionStatus = ({ isConnected }: ConnectionStatusProps) => {
  if (isConnected) {
    return null;
  }

  return (
    <div className="connection-status disconnected">
      <div className="connection-status-content">
        <span className="connection-status-icon">⚠️</span>
        <span className="connection-status-text">
          Disconnected from ACARS Hub backend. Attempting to reconnect...
        </span>
      </div>
    </div>
  );
};
