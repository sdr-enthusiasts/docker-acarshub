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
import { selectMessages, useAppStore } from "../store/useAppStore";

/**
 * LiveMessagesPage Component
 * Displays real-time ACARS messages as they arrive from aircraft
 *
 * This is a placeholder for Phase 1. Full implementation will come in Phase 6.
 */
export const LiveMessagesPage = () => {
  const messages = useAppStore(selectMessages);
  const setCurrentPage = useAppStore((state) => state.setCurrentPage);

  useEffect(() => {
    setCurrentPage("Live Messages");
    socketService.notifyPageChange("Live Messages");
  }, [setCurrentPage]);

  const messageCount = messages.size;
  let totalMessages = 0;
  messages.forEach((plane) => {
    totalMessages += plane.messages.length;
  });

  return (
    <div className="page live-messages-page">
      <div className="page-header">
        <h1>Live Messages</h1>
        <div className="page-stats">
          <span className="stat">
            <strong>{messageCount}</strong> aircraft
          </span>
          <span className="stat">
            <strong>{totalMessages}</strong> messages
          </span>
        </div>
      </div>

      <div className="page-content">
        <div className="placeholder-message">
          <h2>Live Messages View</h2>
          <p>This page will display real-time ACARS messages from aircraft.</p>
          <p className="text-muted">
            Full implementation coming in Phase 6 of the React migration.
          </p>
          {messageCount > 0 && (
            <div className="debug-info">
              <h3>Debug: Receiving Messages</h3>
              <p>
                Currently tracking {messageCount} aircraft with {totalMessages}{" "}
                total messages.
              </p>
              <p>Messages are being received and stored in the global state.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
