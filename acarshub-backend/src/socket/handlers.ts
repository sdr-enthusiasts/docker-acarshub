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
  SystemStatus,
  Terms,
} from "@acarshub/types";
import { sql } from "drizzle-orm";
import { getConfig } from "../config.js";
import {
  databaseSearch,
  getAlertCounts,
  getAllFreqCounts,
  getAllSignalLevels,
  getCachedAlertIgnoreTerms,
  getCachedAlertTerms,
  getDatabase,
  getErrors,
  getPerDecoderMessageCounts,
  getRowCount,
  grabMostRecent,
  regenerateAllAlertMatches,
  searchAlerts,
  searchAlertsByTerm,
  setAlertIgnore,
  setAlertTerms,
} from "../db/index.js";
import type { SearchParams } from "../db/queries/messages.js";
import { enrichMessage, enrichMessages } from "../formatters/enrichment.js";
import { getAdsbPoller } from "../services/adsb-poller.js";
import { getMessageQueue } from "../services/message-queue.js";
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
    // Note: signal_graphs is not in SocketEmitEvents but Python supports it
    // @ts-expect-error - Python backend supports this event
    socket.on("signal_graphs", () => handleSignalGraphs(socket));

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
      },
    };
    socket.emit("features_enabled", decoders);

    // 2. Send alert terms
    // Use the DB-backed cache (getCachedAlertTerms / getCachedAlertIgnoreTerms)
    // rather than config.alertTerms, which is never populated from the database.
    // This matches Python: get_alert_terms() / get_alert_ignore() return the
    // in-memory globals that are loaded from the DB at startup.
    const terms: Terms = {
      terms: getCachedAlertTerms(),
      ignore: getCachedAlertIgnoreTerms(),
    };
    socket.emit("terms", terms);

    // 3. Send message labels
    const labels: Labels = {
      labels: config.messageLabels as Record<string, { name: string }>,
    };
    socket.emit("labels", labels);

    // 4. Send cached ADS-B data (if available)
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

    // 5. Send recent messages in chunks (filter out alerts)
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

    // 6. Send database size
    // Python sends "database" event with {count, size}, NOT "database_size"
    const { count, size } = getRowCount();
    const dbSize: DatabaseSize = {
      count,
      size: size ?? 0,
    };
    socket.emit("database", dbSize);

    // 7. Send signal levels
    // Python sends raw object with uppercase decoder names: {"ACARS": [...], "VDL-M2": [...]}
    const signalLevels = getAllSignalLevels();
    socket.emit("signal", { levels: signalLevels });

    // 8. Send alert statistics
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

    // 9. Send recent alerts in chunks
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

    // 10. Send version information
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
      resultsAfter: params.results_after,
    });

    // Calculate pagination: results_after is the page number (0-indexed)
    const page = params.results_after ?? 0;
    const limit = 50;
    const offset = page * limit;

    // Normalize msg_type from display values to database storage format.
    // Python getQueType() and TypeScript normalizeMessageType() both store:
    //   VDLM2 → "VDL-M2",  IMSL → "IMS-L",  all others unchanged.
    const msgTypeNormalizationMap: Record<string, string> = {
      VDLM2: "VDL-M2",
      IMSL: "IMS-L",
    };
    const rawMsgType = params.search_term.msg_type || "";
    const normalizedMsgType = rawMsgType
      ? (msgTypeNormalizationMap[rawMsgType] ?? rawMsgType)
      : undefined;

    // Convert CurrentSearch to SearchParams format
    const searchQuery: SearchParams = {
      messageType: normalizedMsgType,
      icao: params.search_term.icao || undefined,
      tail: params.search_term.tail || undefined,
      flight: params.search_term.flight || undefined,
      stationId: params.search_term.station_id || undefined,
      depa: params.search_term.depa || undefined,
      dsta: params.search_term.dsta || undefined,
      text: params.search_term.msg_text || undefined,
      label: params.search_term.label || undefined,
      freq: params.search_term.freq || undefined,
      msgno: params.search_term.msgno || undefined,
      limit,
      offset,
    };

    const results = databaseSearch(searchQuery);
    const enrichedMessages = enrichMessages(results.messages);

    const elapsed = performance.now() - startTime;

    const response: SearchHtmlMsg = {
      msghtml: enrichedMessages,
      query_time: elapsed / 1000, // Convert milliseconds to seconds (Python uses time.time() which returns seconds)
      num_results: results.totalCount,
    };

    socket.emit("database_search_results", response);

    logger.debug("Database search complete", {
      socketId: socket.id,
      total: results.totalCount,
      returned: enrichedMessages.length,
      page,
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

    // Update alert terms in DB and in-memory cache
    setAlertTerms(terms.terms);
    setAlertIgnore(terms.ignore);

    // Broadcast updated terms to all clients.
    // Read back from the DB cache AFTER the update — config.alertTerms is a
    // stale snapshot from before setAlertTerms() was called and would send the
    // old values back to clients.
    const updatedTerms: Terms = {
      terms: getCachedAlertTerms(),
      ignore: getCachedAlertIgnoreTerms(),
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
 * Track whether an alert match regeneration is already running.
 * better-sqlite3 is synchronous so Node is single-threaded here, but we still
 * guard against a second client kicking off a second run while the first is
 * executing inside a setImmediate callback.
 */
let alertRegenInProgress = false;

/**
 * Handle regenerate alert matches request
 *
 * Mirrors Python: @socketio.on("regenerate_alert_matches", namespace="/main")
 *
 * Protocol (matches Python acarshub.py):
 *  1. Permission denied  → emit regenerate_alert_matches_error to requester
 *  2. Already in progress → emit regenerate_alert_matches_error to requester
 *  3. Otherwise:
 *     a. Set in-progress flag
 *     b. Emit regenerate_alert_matches_started to requester
 *     c. Run regeneration (deferred via setImmediate so the started event
 *        is delivered before the synchronous DB work blocks the event loop)
 *     d. Emit regenerate_alert_matches_complete (or _error) to requester
 *     e. Broadcast updated alert_terms to all clients
 *     f. Clear in-progress flag
 */
function handleRegenerateAlertMatches(
  socket: TypedSocket,
  io: TypedSocketServer,
): void {
  const config = getConfig();

  if (!config.allowRemoteUpdates) {
    logger.error("Remote updates are disabled, rejecting regenerate request", {
      socketId: socket.id,
    });
    socket.emit("regenerate_alert_matches_error", {
      error: "Remote updates are disabled",
    });
    return;
  }

  if (alertRegenInProgress) {
    logger.warn("Alert regeneration already in progress", {
      socketId: socket.id,
    });
    socket.emit("regenerate_alert_matches_error", {
      error: "Alert regeneration already in progress",
    });
    return;
  }

  alertRegenInProgress = true;

  logger.info("Starting alert match regeneration", { socketId: socket.id });

  // Acknowledge immediately so the client knows work has started
  socket.emit("regenerate_alert_matches_started", {
    message: "Alert regeneration started in background",
  });

  // Defer the heavy synchronous work so Socket.IO can flush the started event
  // before the DB work blocks the event loop (mirrors Python's background task)
  setImmediate(() => {
    try {
      const startTime = performance.now();
      const alertTerms = getCachedAlertTerms();
      const alertIgnoreTerms = getCachedAlertIgnoreTerms();
      const stats = regenerateAllAlertMatches(alertTerms, alertIgnoreTerms);
      const elapsed = performance.now() - startTime;

      logger.info("Alert match regeneration complete", {
        socketId: socket.id,
        stats,
        elapsed: `${elapsed.toFixed(2)}ms`,
      });

      socket.emit("regenerate_alert_matches_complete", {
        success: true,
        stats,
      });

      // Broadcast updated alert counts to ALL clients (matches Python behaviour)
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
      io.of("/main").emit("alert_terms", { data: alertTermData });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("Error during alert match regeneration", {
        socketId: socket.id,
        error: message,
      });
      socket.emit("regenerate_alert_matches_error", { error: message });
    } finally {
      alertRegenInProgress = false;
    }
  });
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
    const errorStats = getErrors();
    const formatted: SignalCountData = {
      count: {
        non_empty_total: errorStats.non_empty_total,
        non_empty_errors: errorStats.non_empty_errors,
        empty_total: errorStats.empty_total,
        empty_errors: errorStats.empty_errors,
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
      query_time: elapsed / 1000, // Convert milliseconds to seconds (Python uses time.time() which returns seconds)
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
/**
 * Handle signal_graphs request
 *
 * Python implementation: acarshub.py request_graphs()
 * Sends alert terms and signal levels to requesting client
 */
function handleSignalGraphs(socket: TypedSocket): void {
  try {
    // Send alert terms
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
    socket.emit("alert_terms", { data: alertTermData });

    // Send signal levels
    const signalLevels = getAllSignalLevels();
    socket.emit("signal", { levels: signalLevels });

    logger.debug("Signal graphs data sent", { socketId: socket.id });
  } catch (error) {
    logger.error("Failed to send signal graphs", {
      socketId: socket.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Handle rrd_timeseries request
 *
 * Python implementation: Not directly equivalent - Python used RRD files
 * TypeScript uses timeseries_stats table populated by stats writer
 *
 * Request format: {
 *   start?: number,  // Unix timestamp (defaults to 24h ago)
 *   end?: number,    // Unix timestamp (defaults to now)
 *   downsample?: number  // Seconds between points (defaults to 300 = 5min)
 * }
 *
 * Response format: {
 *   data: [
 *     { timestamp, acars, vdlm, hfdl, imsl, irdm, total, error },
 *     ...
 *   ]
 * }
 */
/**
 * Zero-fill a time-series result set so every bucket in [start, end] has an
 * entry.  DB rows that exist are kept as-is; missing buckets are synthesised
 * with all-zero counts.  Both start/end and bucket timestamps are in Unix
 * **seconds** at this stage (conversion to ms happens when we emit).
 *
 * @param dbRows   Rows already sorted by bucket_timestamp ascending
 * @param start    Range start (Unix seconds, inclusive)
 * @param end      Range end   (Unix seconds, inclusive)
 * @param step     Bucket width in seconds (e.g. 60 for 1-minute buckets)
 */
function zeroFillBuckets(
  dbRows: Array<{
    timestamp: number;
    acars: number;
    vdlm: number;
    hfdl: number;
    imsl: number;
    irdm: number;
    total: number;
    error: number;
  }>,
  start: number,
  end: number,
  step: number,
): Array<{
  timestamp: number;
  acars: number;
  vdlm: number;
  hfdl: number;
  imsl: number;
  irdm: number;
  total: number;
  error: number;
}> {
  // Build a lookup map from bucket timestamp → row
  const rowMap = new Map<
    number,
    {
      timestamp: number;
      acars: number;
      vdlm: number;
      hfdl: number;
      imsl: number;
      irdm: number;
      total: number;
      error: number;
    }
  >();
  for (const row of dbRows) {
    // Align the stored timestamp to the same bucket grid used during query
    const bucketTs = Math.floor(row.timestamp / step) * step;
    rowMap.set(bucketTs, { ...row, timestamp: bucketTs });
  }

  const filled: Array<{
    timestamp: number;
    acars: number;
    vdlm: number;
    hfdl: number;
    imsl: number;
    irdm: number;
    total: number;
    error: number;
  }> = [];

  // Align start to the bucket grid
  const alignedStart = Math.floor(start / step) * step;

  for (let ts = alignedStart; ts <= end; ts += step) {
    const existing = rowMap.get(ts);
    if (existing) {
      filled.push(existing);
    } else {
      filled.push({
        timestamp: ts,
        acars: 0,
        vdlm: 0,
        hfdl: 0,
        imsl: 0,
        irdm: 0,
        total: 0,
        error: 0,
      });
    }
  }

  return filled;
}

async function handleRRDTimeseries(
  socket: TypedSocket,
  params: {
    time_period?: string; // Python format: "1hr" | "6hr" | "12hr" | "24hr" | "1wk" | "30day" | "6mon" | "1yr"
    start?: number; // Unix timestamp (seconds)
    end?: number; // Unix timestamp (seconds)
    downsample?: number; // Bucket size in seconds (e.g., 300 for 5-minute buckets)
  },
): Promise<void> {
  try {
    const now = Math.floor(Date.now() / 1000);
    let start: number;
    let end: number;
    let downsample: number | undefined;
    let timePeriod: string | undefined;

    // Support Python-style time_period parameter
    if (params.time_period) {
      timePeriod = params.time_period;
      const periodMap: Record<
        string,
        { startOffset: number; downsample: number }
      > = {
        "1hr": { startOffset: 3600, downsample: 60 }, // 1 hour, 1-minute buckets
        "6hr": { startOffset: 21600, downsample: 60 }, // 6 hours, 1-minute buckets
        "12hr": { startOffset: 43200, downsample: 60 }, // 12 hours, 1-minute buckets
        "24hr": { startOffset: 86400, downsample: 300 }, // 24 hours, 5-minute buckets
        "1wk": { startOffset: 604800, downsample: 1800 }, // 1 week, 30-minute buckets
        "30day": { startOffset: 2592000, downsample: 3600 }, // 30 days, 1-hour buckets
        "6mon": { startOffset: 15768000, downsample: 21600 }, // 6 months, 6-hour buckets
        "1yr": { startOffset: 31536000, downsample: 43200 }, // 1 year, 12-hour buckets
      };

      const config = periodMap[params.time_period];
      if (!config) {
        socket.emit("rrd_timeseries_data", {
          error: `Invalid time period: ${params.time_period}`,
          data: [],
          time_period: params.time_period,
          points: 0,
        });
        return;
      }

      start = now - config.startOffset;
      end = now;
      downsample = config.downsample;
    } else {
      // Use explicit start/end/downsample parameters
      start = params.start ?? now - 86400; // Default: last 24 hours
      end = params.end ?? now;
      downsample = params.downsample;
    }

    logger.debug("RRD timeseries query", {
      socketId: socket.id,
      timePeriod,
      start,
      end,
      downsample,
      rangeHours: Math.round((end - start) / 3600),
    });

    // Bucket step for 1-minute resolution (used when not downsampling)
    const minuteStep = 60;

    // If downsampling requested, use raw SQL for better performance
    if (downsample && downsample > 60) {
      const db = getDatabase();

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

      // Map DB results to the common shape expected by zeroFillBuckets
      const rawRows = results.map((row) => ({
        timestamp: row.bucket_timestamp,
        acars: row.acars_count,
        vdlm: row.vdlm_count,
        hfdl: row.hfdl_count,
        imsl: row.imsl_count,
        irdm: row.irdm_count,
        total: row.total_count,
        error: row.error_count,
      }));

      // Zero-fill so every downsample-width bucket in [start, end] is present.
      // Missing buckets get all-zero counts so the chart shows a flat baseline
      // rather than connecting the tips of spikes across silent periods.
      const filledRows = zeroFillBuckets(rawRows, start, end, downsample);

      // Convert timestamps seconds → milliseconds for Chart.js time scale
      const formattedData = filledRows.map((row) => ({
        ...row,
        timestamp: row.timestamp * 1000,
      }));

      const response: {
        data: Array<{
          timestamp: number;
          acars: number;
          vdlm: number;
          hfdl: number;
          imsl: number;
          irdm: number;
          total: number;
          error: number;
        }>;
        time_period?: string;
        start?: number;
        end?: number;
        downsample?: number;
        points: number;
      } = {
        // start/end in milliseconds so the frontend can pin the chart x-axis
        start: start * 1000,
        end: end * 1000,
        data: formattedData,
        points: formattedData.length,
      };

      if (timePeriod) {
        response.time_period = timePeriod;
      } else {
        response.downsample = downsample;
      }

      socket.emit("rrd_timeseries_data", response);

      logger.debug("RRD timeseries response (downsampled)", {
        socketId: socket.id,
        points: formattedData.length,
      });
    } else {
      // Use Drizzle ORM for non-downsampled queries (1-minute resolution).
      // This path handles 1hr / 6hr / 12hr (all have downsample = 60).
      const data = await queryTimeseriesData("1min", start, end);

      const rawRows = data.map((row) => ({
        timestamp: row.timestamp,
        acars: row.acarsCount ?? 0,
        vdlm: row.vdlmCount ?? 0,
        hfdl: row.hfdlCount ?? 0,
        imsl: row.imslCount ?? 0,
        irdm: row.irdmCount ?? 0,
        total: row.totalCount ?? 0,
        error: row.errorCount ?? 0,
      }));

      // Zero-fill every 1-minute bucket so the chart drops to zero for quiet
      // periods instead of connecting the peaks of adjacent busy minutes.
      const filledRows = zeroFillBuckets(rawRows, start, end, minuteStep);

      // Convert timestamps seconds → milliseconds for Chart.js time scale
      const formattedData = filledRows.map((row) => ({
        ...row,
        timestamp: row.timestamp * 1000,
      }));

      const response: {
        data: Array<{
          timestamp: number;
          acars: number;
          vdlm: number;
          hfdl: number;
          imsl: number;
          irdm: number;
          total: number;
          error: number;
        }>;
        time_period?: string;
        start?: number;
        end?: number;
        points: number;
      } = {
        // start/end in milliseconds so the frontend can pin the chart x-axis
        start: start * 1000,
        end: end * 1000,
        data: formattedData,
        points: formattedData.length,
      };

      if (timePeriod) {
        response.time_period = timePeriod;
      }

      socket.emit("rrd_timeseries_data", response);

      logger.debug("RRD timeseries response", {
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
 * Matches Python format from get_realtime_status()
 * Python uses uppercase decoder names (ACARS, VDLM2, HFDL, IMSL, IRDM)
 * and includes per-decoder entries in global status
 */
function getSystemStatus(): SystemStatus {
  const config = getConfig();
  const decoderCounts = getPerDecoderMessageCounts();
  const queueStats = getMessageQueue().getStats();

  const decodersStatus: Record<
    string,
    { Status: string; Connected: boolean; Alive: boolean }
  > = {};
  const serversStatus: Record<string, { Status: string; Messages: number }> =
    {};
  const globalStatus: Record<
    string,
    { Status: string; Count: number; LastMinute?: number }
  > = {};

  // ACARS status
  if (config.enableAcars) {
    decodersStatus.ACARS = {
      Status: "Ok",
      Connected: true,
      Alive: true,
    };
    serversStatus.acars_server = {
      Status: "Ok",
      Messages: decoderCounts.acars,
    };
    globalStatus.ACARS = {
      Status: "Ok",
      Count: decoderCounts.acars,
      LastMinute: queueStats.acars.lastMinute,
    };
  }

  // VDLM2 status
  if (config.enableVdlm) {
    decodersStatus.VDLM2 = {
      Status: "Ok",
      Connected: true,
      Alive: true,
    };
    serversStatus.vdlm2_server = {
      Status: "Ok",
      Messages: decoderCounts.vdlm2,
    };
    globalStatus.VDLM2 = {
      Status: "Ok",
      Count: decoderCounts.vdlm2,
      LastMinute: queueStats.vdlm2.lastMinute,
    };
  }

  // HFDL status
  if (config.enableHfdl) {
    decodersStatus.HFDL = {
      Status: "Ok",
      Connected: true,
      Alive: true,
    };
    serversStatus.hfdl_server = {
      Status: "Ok",
      Messages: decoderCounts.hfdl,
    };
    globalStatus.HFDL = {
      Status: "Ok",
      Count: decoderCounts.hfdl,
      LastMinute: queueStats.hfdl.lastMinute,
    };
  }

  // IMSL status
  if (config.enableImsl) {
    decodersStatus.IMSL = {
      Status: "Ok",
      Connected: true,
      Alive: true,
    };
    serversStatus.imsl_server = {
      Status: "Ok",
      Messages: decoderCounts.imsl,
    };
    globalStatus.IMSL = {
      Status: "Ok",
      Count: decoderCounts.imsl,
      LastMinute: queueStats.imsl.lastMinute,
    };
  }

  // IRDM status
  if (config.enableIrdm) {
    decodersStatus.IRDM = {
      Status: "Ok",
      Connected: true,
      Alive: true,
    };
    serversStatus.irdm_server = {
      Status: "Ok",
      Messages: decoderCounts.irdm,
    };
    globalStatus.IRDM = {
      Status: "Ok",
      Count: decoderCounts.irdm,
      LastMinute: queueStats.irdm.lastMinute,
    };
  }

  return {
    status: {
      error_state: false,
      decoders: decodersStatus,
      servers: serversStatus,
      global: globalStatus,
      stats: {}, // Legacy compatibility (empty)
      external_formats: {}, // Legacy compatibility (empty)
      errors: {
        Total: queueStats.error.total,
        LastMinute: queueStats.error.lastMinute,
      },
      threads: {
        database: true,
        scheduler: true, // TypeScript backend doesn't have separate scheduler thread
      },
    },
  };
}
