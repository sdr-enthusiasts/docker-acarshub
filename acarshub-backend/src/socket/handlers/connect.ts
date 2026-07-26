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
 * Socket.IO connect handler (GOD-01 split from socket/handlers.ts)
 *
 * Sends the full initial-state payload to a newly connected client:
 * features_enabled, station_ids, terms, labels, cached ADS-B data,
 * recent messages (chunked), database size, signal levels, alert
 * statistics, recent alerts (chunked), and version info.
 */

import type {
  AcarshubVersion,
  DatabaseSize,
  Decoders,
  Labels,
  Terms,
} from "@acarshub/types";
import { getConfig, MESSAGE_BATCH_CHUNK_SIZE, VERSIONS } from "../../config.js";
import {
  getAlertCounts,
  getAllSignalLevels,
  getCachedAlertIgnoreTerms,
  getCachedAlertTerms,
  getRowCount,
} from "../../db/index.js";
import { getAdsbPoller } from "../../services/adsb-poller.js";
import { getHeyWhatsThatUrl } from "../../services/heywhatsthat.js";
import {
  getRecentAlerts,
  getRecentMessages,
} from "../../services/message-ring-buffer.js";
import { getStationIds } from "../../services/station-ids.js";
import { createLogger } from "../../utils/logger.js";
import type { TypedSocket, TypedSocketServer } from "../types.js";

const logger = createLogger("socket:handlers-connect");

/**
 * Handle client connection - send initial data
 *
 * Exported so that server.ts can call it for sockets that connected during
 * the migration window and were held in the pending queue.
 *
 * Mirrors Python: @socketio.on("connect", namespace="/main")
 *
 * Sends:
 * - features_enabled (decoders)
 * - terms (alert terms and ignore list)
 * - labels (message labels)
 * - acars_msg_batch (recent messages in chunks)
 * - database (count and size)
 * - signal (signal levels)
 * - alert_terms (alert statistics)
 * - alert_matches_batch (recent alerts in chunks)
 * - acarshub_version (version info)
 */
export function handleConnect(
  socket: TypedSocket,
  _io: TypedSocketServer,
): void {
  const startTime = performance.now();
  const config = getConfig();

  try {
    // 1. Send features/decoders configuration
    // Python sends "features_enabled" event, NOT "decoders"
    const decoders: Decoders = {
      acars: config.enableAcars,
      vdlm: config.enableVdlm,
      hfdl: config.enableHfdl,
      imsl: config.enableImsl,
      irdm: config.enableIrdm,
      allow_remote_updates: config.allowRemoteUpdates,
      adsb: {
        enabled: config.enableAdsb,
        lat: config.adsbLat,
        lon: config.adsbLon,
        range_rings: config.enableRangeRings,
        heywhatsthat_url: getHeyWhatsThatUrl(),
      },
    };
    socket.emit("features_enabled", decoders);

    // 2. Send station IDs (known sources seen across all message types)
    socket.emit("station_ids", { station_ids: getStationIds() });

    // 3. Send alert terms
    // Use the DB-backed cache (getCachedAlertTerms / getCachedAlertIgnoreTerms)
    // rather than config.alertTerms, which is never populated from the database.
    // This matches Python: get_alert_terms() / get_alert_ignore() return the
    // in-memory globals that are loaded from the DB at startup.
    const terms: Terms = {
      terms: getCachedAlertTerms(),
      ignore: getCachedAlertIgnoreTerms(),
    };
    socket.emit("terms", terms);

    // 4. Send message labels
    const labels: Labels = {
      labels: config.messageLabels as Record<string, { name: string }>,
    };
    socket.emit("labels", labels);

    // 5. Send cached ADS-B data (if available)
    // CRITICAL: Must send BEFORE messages so frontend can match ICAO addresses
    if (config.enableAdsb) {
      try {
        const adsbPoller = getAdsbPoller({ url: config.adsbUrl });
        const cachedAdsbData = adsbPoller.getCachedData();

        if (cachedAdsbData) {
          socket.emit("adsb_aircraft", cachedAdsbData);
          logger.debug("Sent cached ADS-B data", {
            socketId: socket.id,
            aircraftCount: cachedAdsbData.aircraft.length,
          });
        } else {
          logger.debug("No cached ADS-B data available", {
            socketId: socket.id,
          });
        }
      } catch (error) {
        logger.warn("Failed to get cached ADS-B data", {
          socketId: socket.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // 6. Send recent messages in chunks (from ring buffer — no DB query or re-enrichment)
    const nonAlertMessages = getRecentMessages();

    const chunkSize = MESSAGE_BATCH_CHUNK_SIZE;
    const totalMessages = nonAlertMessages.length;

    logger.debug("Sending recent messages", {
      socketId: socket.id,
      total: totalMessages,
      chunks: Math.ceil(totalMessages / chunkSize),
    });

    if (totalMessages === 0) {
      // Emit a terminal empty batch so clients receive done_loading=true and
      // can transition out of their loading state even when the ring buffer
      // is empty (e.g. a fresh install with no messages yet).
      socket.emit("acars_msg_batch", {
        messages: [],
        loading: false,
        done_loading: true,
      });
    } else {
      for (let i = 0; i < totalMessages; i += chunkSize) {
        const chunk = nonAlertMessages.slice(i, i + chunkSize);
        const isLastChunk = i + chunkSize >= totalMessages;

        // Send as batch with loading indicators
        socket.emit("acars_msg_batch", {
          messages: chunk,
          loading: true,
          done_loading: isLastChunk,
        });
      }
    }

    // 7. Send database size
    // Python sends "database" event with {count, size}, NOT "database_size"
    const { count, size } = getRowCount();
    const dbSize: DatabaseSize = {
      count,
      size: size ?? 0,
    };
    socket.emit("database", dbSize);

    // 8. Send signal levels
    // Python sends raw object with uppercase decoder names: {"ACARS": [...], "VDL-M2": [...]}
    const signalLevels = getAllSignalLevels();
    socket.emit("signal", { levels: signalLevels });

    // 9. Send alert statistics
    const alertCounts = getAlertCounts();
    const alertTermData: Record<
      number,
      { count: number; id: number; term: string }
    > = {};
    for (let i = 0; i < alertCounts.length; i++) {
      alertTermData[i] = {
        count: alertCounts[i].count ?? 0,
        id: i,
        term: alertCounts[i].term ?? "",
      };
    }
    // Python sends "alert_terms" with {data: ...}, NOT "alert_terms_stats"
    socket.emit("alert_terms", { data: alertTermData });

    // 10. Send recent alerts in chunks (from ring buffer — no DB query or re-enrichment)
    const recentAlerts = getRecentAlerts();

    const totalAlerts = recentAlerts.length;
    logger.debug("Sending alert cache", {
      socketId: socket.id,
      total: totalAlerts,
    });

    if (totalAlerts === 0) {
      // Emit a terminal empty batch so clients receive done_loading=true even
      // when the alert ring buffer is empty.
      socket.emit("alert_matches_batch", {
        messages: [],
        loading: false,
        done_loading: true,
      });
    } else {
      for (let i = 0; i < totalAlerts; i += chunkSize) {
        const chunk = recentAlerts.slice(i, i + chunkSize);
        const isLastChunk = i + chunkSize >= totalAlerts;

        socket.emit("alert_matches_batch", {
          messages: chunk,
          loading: true,
          done_loading: isLastChunk,
        });
      }
    }

    // 11. Send version information
    // Each version field comes from the corresponding workspace package.json,
    // read at startup by config.ts rather than injected as a Docker ARG.
    const versionInfo: AcarshubVersion = {
      container_version: VERSIONS.container,
      backend_version: VERSIONS.backend,
      frontend_version: VERSIONS.frontend,
      github_version: VERSIONS.container, // TODO: Fetch from GitHub API
      is_outdated: false, // TODO: Compare versions
    };
    socket.emit("acarshub_version", versionInfo);

    const elapsed = performance.now() - startTime;
    logger.debug("Client initialization complete", {
      socketId: socket.id,
      elapsed: `${elapsed.toFixed(2)}ms`,
      messages: totalMessages,
      alerts: totalAlerts,
    });
  } catch (error) {
    logger.error("Error during client connection", {
      socketId: socket.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
