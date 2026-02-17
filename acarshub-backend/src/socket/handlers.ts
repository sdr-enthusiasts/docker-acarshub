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
 * Socket.IO Event Handlers
 *
 * Week 2 Implementation: Replicates Flask-SocketIO handlers from acarshub.py
 * All handlers match Python implementation for API parity
 *
 * Architecture:
 * - Database layer returns raw data (msg_text, time, snake_case)
 * - Enrichment layer transforms to frontend format (text, timestamp, derived fields)
 * - Socket.IO handlers emit properly formatted messages
 */

import type {
  AcarshubVersion,
  AlertsByTermResults,
  CurrentSearch,
  DatabaseSize,
  Decoders,
  Labels,
  SearchHtmlMsg,
  SignalCountData,
  SignalFreqData,
  SignalLevelData,
  SystemStatus,
  Terms,
} from "@acarshub/types";
import { getConfig } from "../config.js";
import {
  databaseSearch,
  getAlertCounts,
  getAllFreqCounts,
  getAllSignalLevels,
  getCachedAlertIgnoreTerms,
  getCachedAlertTerms,
  getDatabase,
  getMessageCountStats,
  getRowCount,
  grabMostRecent,
  regenerateAllAlertMatches,
  searchAlerts,
  searchAlertsByTerm,
  setAlertIgnore,
  setAlertTerms,
} from "../db/index.js";
import { enrichMessage, enrichMessages } from "../formatters/enrichment.js";
import { queryTimeseriesData } from "../services/rrd-migration.js";
import { createLogger } from "../utils/logger.js";
import type { TypedSocket, TypedSocketServer } from "./types.js";

const logger = createLogger("socket:handlers");

/**
 * Register all Socket.IO event handlers
 */
export function registerHandlers(io: TypedSocketServer): void {
  const namespace = io.of("/main");

  namespace.on("connection", (socket: TypedSocket) => {
    logger.info("Client connected", {
      socketId: socket.id,
      transport: socket.conn.transport.name,
    });

    // Handle connect event - send initial data
    handleConnect(socket, namespace.server);

    // Register all event handlers
    socket.on("query_search", (params) => handleQuerySearch(socket, params));
    socket.on("update_alerts", (terms) =>
      handleUpdateAlerts(socket, namespace.server, terms),
    );
    // Note: regenerate_alert_matches is not in SocketEmitEvents but Python supports it
    // @ts-expect-error - Python backend supports this event
    socket.on("regenerate_alert_matches", () =>
      handleRegenerateAlertMatches(socket, namespace.server),
    );
    socket.on("request_status", () => handleRequestStatus(socket));
    socket.on("signal_freqs", () => handleSignalFreqs(socket));
    socket.on("signal_count", () => handleSignalCount(socket));
    socket.on("alert_term_query", (params) =>
      handleAlertTermQuery(socket, params),
    );
    socket.on("query_alerts_by_term", (params) =>
      handleQueryAlertsByTerm(socket, params),
    );
    socket.on("rrd_timeseries", (params) =>
      handleRRDTimeseries(socket, params),
    );

    socket.on("disconnect", (reason) => {
      logger.info("Client disconnected", {
        socketId: socket.id,
        reason,
      });
    });
  });

  logger.info("Socket.IO handlers registered on /main namespace");
}

/**
 * Handle client connection - send initial data
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
function handleConnect(socket: TypedSocket, _io: TypedSocketServer): void {
  const startTime = performance.now();
  const config = getConfig();

  try {
    // 1. Send features/decoders configuration
    const decoders: Decoders = {
      acars: config.enableAcars,
      vdlm: config.enableVdlm,
      hfdl: config.enableHfdl,
      imsl: config.enableImsl,
      irdm: config.enableIrdm,
      allow_remote_updates: config.allowRemoteUpdates,
      adsb: {
        enabled: false, // TODO: Week 3 - ADS-B integration
        lat: 0,
        lon: 0,
        range_rings: false,
      },
    };
    socket.emit("decoders", decoders);

    // 2. Send alert terms
    const terms: Terms = {
      terms: config.alertTerms,
      ignore: config.alertIgnoreTerms,
    };
    socket.emit("terms", terms);

    // 3. Send message labels
    const labels: Labels = {
      labels: config.messageLabels as Record<string, { name: string }>,
    };
    socket.emit("labels", labels);

    // 4. Send recent messages in chunks (filter out alerts)
    const recentMessagesRaw = grabMostRecent(250);
    const recentMessages = enrichMessages(recentMessagesRaw);
    const nonAlertMessages = recentMessages.filter((msg) => !msg.matched);

    const chunkSize = 25;
    const totalMessages = nonAlertMessages.length;

    logger.debug("Sending recent messages", {
      socketId: socket.id,
      total: totalMessages,
      chunks: Math.ceil(totalMessages / chunkSize),
    });

    for (let i = 0; i < totalMessages; i += chunkSize) {
      const chunk = nonAlertMessages.slice(i, i + chunkSize);
      const isLastChunk = i + chunkSize >= totalMessages;

      // Send as batch with loading indicators
      // Note: acars_msg_batch is not in SocketEvents but Python sends it
      // @ts-expect-error - Python backend sends this event
      socket.emit("acars_msg_batch", {
        messages: chunk,
        loading: true,
        done_loading: isLastChunk,
      });
    }

    // 5. Send database size
    const { count, size } = getRowCount();
    const dbSize: DatabaseSize = {
      count,
      size: size ?? 0,
    };
    socket.emit("database_size", dbSize);

    // 6. Send signal levels
    const signalLevels = getAllSignalLevels();
    const signalLevelData: SignalLevelData = {
      acars: signalLevels.acars.map((item) => ({
        level: item.level ?? 0,
        count: item.count ?? 0,
      })),
      vdlm2: signalLevels.vdlm2.map((item) => ({
        level: item.level ?? 0,
        count: item.count ?? 0,
      })),
      hfdl: signalLevels.hfdl.map((item) => ({
        level: item.level ?? 0,
        count: item.count ?? 0,
      })),
    };
    socket.emit("signal", { levels: signalLevelData });

    // 7. Send alert statistics
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
    socket.emit("alert_terms_stats", alertTermData);

    // 8. Send recent alerts in chunks
    const recentAlertsRaw = searchAlerts(100, 0);
    const recentAlerts = recentAlertsRaw.map((alert) => {
      const enriched = enrichMessage(alert.message);
      // Add alert metadata back
      enriched.matched = true;
      enriched.matched_text =
        alert.matchType === "text" ? [alert.term] : undefined;
      enriched.matched_icao =
        alert.matchType === "icao" ? [alert.term] : undefined;
      enriched.matched_flight =
        alert.matchType === "flight" ? [alert.term] : undefined;
      enriched.matched_tail =
        alert.matchType === "tail" ? [alert.term] : undefined;
      return enriched;
    });

    const totalAlerts = recentAlerts.length;
    logger.debug("Sending alert cache", {
      socketId: socket.id,
      total: totalAlerts,
    });

    for (let i = 0; i < totalAlerts; i += chunkSize) {
      const chunk = recentAlerts.slice(i, i + chunkSize);
      const isLastChunk = i + chunkSize >= totalAlerts;

      // Note: alert_matches_batch is not in SocketEvents but Python sends it
      // @ts-expect-error - Python backend sends this event
      socket.emit("alert_matches_batch", {
        messages: chunk,
        loading: true,
        done_loading: isLastChunk,
      });
    }

    // 9. Send version information
    const versionInfo: AcarshubVersion = {
      container_version: config.version,
      github_version: config.version, // TODO: Fetch from GitHub API
      is_outdated: false, // TODO: Compare versions
    };
    socket.emit("acarshub_version", versionInfo);

    const elapsed = performance.now() - startTime;
    logger.info("Client initialization complete", {
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

/**
 * Handle database search query
 *
 * Mirrors Python: @socketio.on("query_search", namespace="/main")
 */
function handleQuerySearch(
  socket: TypedSocket,
  params: {
    search_term: CurrentSearch;
    results_after?: number;
    show_all?: boolean;
  },
): void {
  const startTime = performance.now();

  try {
    logger.debug("Processing database search", {
      socketId: socket.id,
      searchTerm: params.search_term,
    });

    // Convert CurrentSearch to DatabaseSearchQuery format
    const searchQuery = {
      msgType: undefined, // TODO: Map from CurrentSearch if needed
      icao: params.search_term.icao || undefined,
      tail: params.search_term.tail || undefined,
      flight: params.search_term.flight || undefined,
      station_id: params.search_term.station_id || undefined,
      depa: params.search_term.depa || undefined,
      dsta: params.search_term.dsta || undefined,
      search_term: params.search_term.msg_text || undefined,
      label: params.search_term.label || undefined,
      page: 0,
      limit: 50,
    };

    const results = databaseSearch(searchQuery);
    const enrichedMessages = enrichMessages(results.messages);

    const elapsed = performance.now() - startTime;

    const response: SearchHtmlMsg = {
      msghtml: enrichedMessages,
      query_time: elapsed,
      num_results: enrichedMessages.length,
    };

    socket.emit("database_search_results", response);

    logger.debug("Database search complete", {
      socketId: socket.id,
      total: enrichedMessages.length,
      returned: enrichedMessages.length,
      elapsed: `${elapsed.toFixed(2)}ms`,
    });
  } catch (error) {
    logger.error("Error during database search", {
      socketId: socket.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Handle alert terms update
 *
 * Mirrors Python: @socketio.on("update_alerts", namespace="/main")
 */
function handleUpdateAlerts(
  socket: TypedSocket,
  io: TypedSocketServer,
  terms: Terms,
): void {
  const config = getConfig();

  if (!config.allowRemoteUpdates) {
    logger.error("Remote updates are disabled", {
      socketId: socket.id,
    });
    return;
  }

  try {
    logger.info("Updating alert terms", {
      socketId: socket.id,
      termsCount: terms.terms.length,
      ignoreCount: terms.ignore.length,
    });

    // Update alert terms
    setAlertTerms(terms.terms);
    setAlertIgnore(terms.ignore);

    // Broadcast updated terms to all clients
    const updatedTerms: Terms = {
      terms: config.alertTerms,
      ignore: config.alertIgnoreTerms,
    };
    io.of("/main").emit("terms", updatedTerms);

    logger.info("Alert terms updated successfully", {
      socketId: socket.id,
    });
  } catch (error) {
    logger.error("Error updating alert terms", {
      socketId: socket.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Handle regenerate alert matches request
 *
 * Mirrors Python: @socketio.on("regenerate_alert_matches", namespace="/main")
 */
function handleRegenerateAlertMatches(
  socket: TypedSocket,
  io: TypedSocketServer,
): void {
  const config = getConfig();

  if (!config.allowRemoteUpdates) {
    logger.error("Remote updates are disabled", {
      socketId: socket.id,
    });
    return;
  }

  try {
    logger.info("Starting alert matches regeneration", {
      socketId: socket.id,
    });

    const startTime = performance.now();
    const alertTerms = getCachedAlertTerms();
    const alertIgnoreTerms = getCachedAlertIgnoreTerms();
    const matched = regenerateAllAlertMatches(alertTerms, alertIgnoreTerms);
    const elapsed = performance.now() - startTime;

    logger.info("Alert matches regenerated", {
      socketId: socket.id,
      matched,
      elapsed: `${elapsed.toFixed(2)}ms`,
    });

    // Send updated alert counts to all clients
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
    io.of("/main").emit("alert_terms_stats", alertTermData);
  } catch (error) {
    logger.error("Error regenerating alert matches", {
      socketId: socket.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Handle system status request
 *
 * Mirrors Python: @socketio.on("request_status", namespace="/main")
 */
function handleRequestStatus(socket: TypedSocket): void {
  try {
    const status = getSystemStatus();
    socket.emit("system_status", status);

    logger.debug("System status sent", {
      socketId: socket.id,
    });
  } catch (error) {
    logger.error("Error getting system status", {
      socketId: socket.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Handle frequency counts request
 *
 * Mirrors Python: @socketio.on("signal_freqs", namespace="/main")
 */
function handleSignalFreqs(socket: TypedSocket): void {
  try {
    const freqData = getAllFreqCounts();
    const formattedData: SignalFreqData = {
      freqs: freqData.map((item) => ({
        freq_type: item.decoder,
        freq: item.freq ?? "",
        count: item.count ?? 0,
      })),
    };

    socket.emit("signal_freqs", formattedData);

    logger.debug("Frequency counts sent", {
      socketId: socket.id,
      count: formattedData.freqs.length,
    });
  } catch (error) {
    logger.error("Error getting frequency counts", {
      socketId: socket.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Handle message count request
 *
 * Mirrors Python: @socketio.on("signal_count", namespace="/main")
 */
function handleSignalCount(socket: TypedSocket): void {
  try {
    const countStats = getMessageCountStats();
    const formatted: SignalCountData = {
      count: {
        non_empty_total: countStats?.good ?? 0,
        non_empty_errors: 0, // TODO: Separate error tracking
        empty_total: 0, // TODO: Track empty messages
        empty_errors: countStats?.errors ?? 0,
      },
    };

    socket.emit("signal_count", formatted);

    logger.debug("Message counts sent", {
      socketId: socket.id,
      stats: formatted.count,
    });
  } catch (error) {
    logger.error("Error getting message counts", {
      socketId: socket.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Handle alert term query
 *
 * Mirrors Python: @socketio.on("alert_term_query", namespace="/main")
 */
function handleAlertTermQuery(
  socket: TypedSocket,
  params: { icao: string; flight: string; tail: string },
): void {
  try {
    logger.debug("Processing alert term query", {
      socketId: socket.id,
      params,
    });

    // Search for messages matching any of the criteria
    const searchResults = databaseSearch({
      icao: params.icao || undefined,
      flight: params.flight || undefined,
      tail: params.tail || undefined,
      limit: 50,
    });

    const enrichedMessages = enrichMessages(searchResults.messages);

    socket.emit("database_search_results", {
      msghtml: enrichedMessages,
      query_time: 0,
      num_results: searchResults.totalCount,
    });

    logger.debug("Alert term query complete", {
      socketId: socket.id,
      results: enrichedMessages.length,
    });
  } catch (error) {
    logger.error("Error processing alert term query", {
      socketId: socket.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Handle alerts by term query
 *
 * Mirrors Python: @socketio.on("query_alerts_by_term", namespace="/main")
 */
function handleQueryAlertsByTerm(
  socket: TypedSocket,
  params: { term: string; page?: number },
): void {
  const startTime = performance.now();

  try {
    logger.debug("Processing alerts by term query", {
      socketId: socket.id,
      term: params.term,
      page: params.page ?? 0,
    });

    const results = searchAlertsByTerm(
      params.term,
      50,
      (params.page ?? 0) * 50,
    );

    const enrichedAlerts = results.map((alert) => {
      const enriched = enrichMessage(alert.message);
      // Add alert metadata back
      enriched.matched = true;
      enriched.matched_text =
        alert.matchType === "text" ? [alert.term] : undefined;
      enriched.matched_icao =
        alert.matchType === "icao" ? [alert.term] : undefined;
      enriched.matched_flight =
        alert.matchType === "flight" ? [alert.term] : undefined;
      enriched.matched_tail =
        alert.matchType === "tail" ? [alert.term] : undefined;
      return enriched;
    });

    const elapsed = performance.now() - startTime;

    const response: AlertsByTermResults = {
      term: params.term,
      messages: enrichedAlerts,
      total_count: enrichedAlerts.length,
      page: params.page ?? 0,
      query_time: elapsed,
    };

    socket.emit("alerts_by_term_results", response);

    logger.debug("Alerts by term sent", {
      socketId: socket.id,
      term: params.term,
      total: enrichedAlerts.length,
      returned: enrichedAlerts.length,
      elapsed: `${elapsed.toFixed(2)}ms`,
    });
  } catch (error) {
    logger.error("Error querying alerts by term", {
      socketId: socket.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Handle rrd_timeseries query - fetch time-series data from database
 *
 * Supports optional downsampling for long time ranges to reduce data transfer
 * and improve chart rendering performance.
 *
 * @param socket - Socket.IO socket
 * @param params - Query parameters (start, end, downsample)
 */
async function handleRRDTimeseries(
  socket: TypedSocket,
  params: {
    start?: number; // Unix timestamp (seconds)
    end?: number; // Unix timestamp (seconds)
    downsample?: number; // Bucket size in seconds (e.g., 300 for 5-minute buckets)
  },
): Promise<void> {
  try {
    const now = Math.floor(Date.now() / 1000);
    const start = params.start ?? now - 86400; // Default: last 24 hours
    const end = params.end ?? now;
    const downsample = params.downsample;

    logger.debug("RRD timeseries query", {
      socketId: socket.id,
      start,
      end,
      downsample,
      rangeHours: Math.round((end - start) / 3600),
    });

    // If downsampling requested, use raw SQL for better performance
    if (downsample && downsample > 60) {
      const db = getDatabase();
      const { sql } = await import("drizzle-orm");

      const results = db.all(
        sql.raw(`
          SELECT
            (timestamp / ${downsample}) * ${downsample} as bucket_timestamp,
            ROUND(AVG(acars_count)) as acars_count,
            ROUND(AVG(vdlm_count)) as vdlm_count,
            ROUND(AVG(hfdl_count)) as hfdl_count,
            ROUND(AVG(imsl_count)) as imsl_count,
            ROUND(AVG(irdm_count)) as irdm_count,
            ROUND(AVG(total_count)) as total_count,
            ROUND(AVG(error_count)) as error_count
          FROM timeseries_stats
          WHERE resolution = '1min'
            AND timestamp >= ${start}
            AND timestamp <= ${end}
          GROUP BY bucket_timestamp
          ORDER BY bucket_timestamp
        `),
      ) as Array<{
        bucket_timestamp: number;
        acars_count: number;
        vdlm_count: number;
        hfdl_count: number;
        imsl_count: number;
        irdm_count: number;
        total_count: number;
        error_count: number;
      }>;

      const formattedData = results.map((row) => ({
        timestamp: row.bucket_timestamp,
        acars: row.acars_count,
        vdlm: row.vdlm_count,
        hfdl: row.hfdl_count,
        imsl: row.imsl_count,
        irdm: row.irdm_count,
        total: row.total_count,
        error: row.error_count,
      }));

      socket.emit("rrd_timeseries_data", {
        data: formattedData,
        start,
        end,
        downsample,
        points: formattedData.length,
      });

      logger.debug("RRD timeseries response (downsampled)", {
        socketId: socket.id,
        points: formattedData.length,
        downsample,
      });
    } else {
      // No downsampling - fetch raw 1-minute data
      const data = await queryTimeseriesData("1min", start, end);

      const formattedData = data.map((row) => ({
        timestamp: row.timestamp,
        acars: row.acarsCount,
        vdlm: row.vdlmCount,
        hfdl: row.hfdlCount,
        imsl: row.imslCount,
        irdm: row.irdmCount,
        total: row.totalCount,
        error: row.errorCount,
      }));

      socket.emit("rrd_timeseries_data", {
        data: formattedData,
        start,
        end,
        points: formattedData.length,
      });

      logger.debug("RRD timeseries response (raw)", {
        socketId: socket.id,
        points: formattedData.length,
      });
    }
  } catch (error) {
    logger.error("Failed to fetch RRD timeseries", {
      socketId: socket.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Get system status data
 *
 * Note: Thread/connection monitoring not yet implemented (Week 3)
 * Returns basic status for now
 */
function getSystemStatus(): SystemStatus {
  const { count: messageCount } = getRowCount();

  return {
    status: {
      error_state: false,
      decoders: {
        acars: { Status: "Not Running", Connected: false, Alive: false },
        vdlm2: { Status: "Not Running", Connected: false, Alive: false },
        hfdl: { Status: "Not Running", Connected: false, Alive: false },
        imsl: { Status: "Not Running", Connected: false, Alive: false },
        irdm: { Status: "Not Running", Connected: false, Alive: false },
      },
      servers: {
        acars: { Status: "Not Running", Messages: 0 },
        vdlm2: { Status: "Not Running", Messages: 0 },
        hfdl: { Status: "Not Running", Messages: 0 },
        imsl: { Status: "Not Running", Messages: 0 },
        irdm: { Status: "Not Running", Messages: 0 },
      },
      global: {
        total: { Status: "Running", Count: messageCount },
        errors: { Status: "OK", Count: 0 },
      },
      stats: {},
      external_formats: {},
      errors: {
        Total: 0,
        LastMinute: 0,
      },
      threads: {
        database: true,
        scheduler: false,
      },
    },
  };
}
