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
 * Socket.IO Event Handlers — registration orchestrator
 *
 * GOD-01: this file used to be a single 1300+ line socket/handlers.ts
 * containing every handler function. Split into per-domain modules:
 *
 * - connect.ts     — handleConnect (initial-state payload on connection)
 * - search.ts      — handleQuerySearch
 * - alerts.ts      — handleUpdateAlerts, handleRegenerateAlertMatches,
 *                     handleAlertTermQuery, handleQueryAlertsByTerm,
 *                     handleRequestRecentAlerts
 * - stats.ts        — handleRequestStatus, handleSignalFreqs,
 *                     handleSignalCount, handleSignalGraphs
 * - timeseries.ts   — handleRRDTimeseries
 *
 * This file is now a thin orchestrator: registerHandlers(io) wires every
 * socket.on(...) registration to the appropriate handler, matching the
 * Flask-SocketIO handlers from the original Python acarshub.py for API
 * parity.
 *
 * Architecture:
 * - Database layer returns raw data (msg_text, time, snake_case)
 * - Enrichment layer transforms to frontend format (text, timestamp, derived fields)
 * - Socket.IO handlers emit properly formatted messages
 */

import {
  isMigrationRunning,
  registerPendingSocket,
} from "../../startup-state.js";
import { createLogger } from "../../utils/logger.js";
import type { TypedSocket, TypedSocketServer } from "../types.js";
import { validatedHandler } from "../validatedHandler.js";
import {
  handleAlertTermQuery,
  handleQueryAlertsByTerm,
  handleRegenerateAlertMatches,
  handleRequestRecentAlerts,
  handleUpdateAlerts,
} from "./alerts.js";
import { handleConnect } from "./connect.js";
import { handleQuerySearch } from "./search.js";
import {
  handleRequestStatus,
  handleSignalCount,
  handleSignalFreqs,
  handleSignalGraphs,
} from "./stats.js";
import { handleRRDTimeseries } from "./timeseries.js";

const logger = createLogger("socket:handlers");

// Re-exported for external consumers: server.ts calls handleConnect
// directly for sockets that connected during the migration window, and
// tests need resetAlertRegenStateForTesting() for isolation.
export { resetAlertRegenStateForTesting } from "./alerts.js";
export { handleConnect } from "./connect.js";

/**
 * Register all Socket.IO event handlers
 */
export function registerHandlers(io: TypedSocketServer): void {
  const namespace = io.of("/main");

  namespace.on("connection", (socket: TypedSocket) => {
    logger.debug("Client connected", {
      socketId: socket.id,
      transport: socket.conn.transport.name,
    });

    if (isMigrationRunning()) {
      // Database migrations are still in progress.  Inform the client and
      // hold it in the pending queue.  Once all init is complete, server.ts
      // drains the queue and calls handleConnect for each surviving socket.
      logger.info(
        "Client connected during migration — deferring full connect sequence",
        { socketId: socket.id },
      );
      socket.emit("migration_status", {
        running: true,
        message:
          "Database migration in progress. This may take several minutes on large databases. Please wait...",
      });
      registerPendingSocket(socket);
    } else {
      // Normal path — migrations are done, deliver the full connect sequence.
      handleConnect(socket, namespace.server);
    }

    // Register all event handlers.
    //
    // The five handlers that take a payload are wrapped with
    // validatedHandler() so that malformed input never reaches the
    // business logic — see SEC-03 in agent-docs/REMEDIATION_PLAN.md.
    // Handlers that take no payload (request_status, signal_freqs,
    // signal_count, signal_graphs, request_recent_alerts,
    // regenerate_alert_matches) are intentionally not wrapped because
    // there is no input to validate.
    socket.on(
      "query_search",
      validatedHandler("query_search", socket, (params) =>
        handleQuerySearch(socket, params),
      ),
    );
    socket.on(
      "update_alerts",
      validatedHandler("update_alerts", socket, (terms) =>
        handleUpdateAlerts(socket, namespace.server, terms),
      ),
    );
    socket.on("regenerate_alert_matches", () =>
      handleRegenerateAlertMatches(socket, namespace.server),
    );
    socket.on("request_status", () => handleRequestStatus(socket));
    socket.on("signal_freqs", () => handleSignalFreqs(socket));
    socket.on("signal_count", () => handleSignalCount(socket));
    socket.on(
      "alert_term_query",
      validatedHandler("alert_term_query", socket, (params) =>
        handleAlertTermQuery(socket, params),
      ),
    );
    socket.on(
      "query_alerts_by_term",
      validatedHandler("query_alerts_by_term", socket, (params) =>
        handleQueryAlertsByTerm(socket, params),
      ),
    );
    socket.on(
      "rrd_timeseries",
      validatedHandler("rrd_timeseries", socket, (params) =>
        handleRRDTimeseries(socket, params),
      ),
    );
    socket.on("signal_graphs", () => handleSignalGraphs(socket));
    socket.on("request_recent_alerts", () => handleRequestRecentAlerts(socket));

    socket.on("disconnect", (reason) => {
      logger.info("Client disconnected", {
        socketId: socket.id,
        reason,
      });
    });
  });

  logger.debug("Socket.IO handlers registered on /main namespace");
}
