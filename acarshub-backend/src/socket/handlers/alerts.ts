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
 * Socket.IO alert-related handlers (GOD-01 split from socket/handlers.ts)
 *
 * Covers: update_alerts, regenerate_alert_matches, alert_term_query,
 * query_alerts_by_term, request_recent_alerts.
 */

import type { AlertsByTermResults, Terms } from "@acarshub/types";
import { getConfig, SEARCH_PAGE_SIZE } from "../../config.js";
import {
  databaseSearch,
  getAlertCounts,
  getCachedAlertIgnoreTerms,
  getCachedAlertTerms,
  regenerateAllAlertMatches,
  searchAlertsByTerm,
  setAlertIgnore,
  setAlertTerms,
} from "../../db/index.js";
import { enrichMessage, enrichMessages } from "../../formatters/enrichment.js";
import {
  getRecentAlerts,
  reheatMessageBuffers,
} from "../../services/message-ring-buffer.js";
import { createLogger } from "../../utils/logger.js";
import type { TypedSocket, TypedSocketServer } from "../types.js";

const logger = createLogger("socket:handlers-alerts");

/**
 * Handle alert terms update
 *
 * Mirrors Python: @socketio.on("update_alerts", namespace="/main")
 */
export async function handleUpdateAlerts(
  socket: TypedSocket,
  io: TypedSocketServer,
  terms: Terms,
): Promise<void> {
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

    // Reheat ring buffers so alert cache reflects the new terms.
    // Old alert matches (for terms that were removed) are purged and new
    // matches (for terms that were added) are picked up from the DB.
    await reheatMessageBuffers();

    // Broadcast refreshed alert content to all connected clients so their
    // alert pages update without requiring a reconnect.
    const refreshedAlerts = getRecentAlerts();
    io.of("/main").emit("alerts_refreshed", { messages: refreshedAlerts });

    logger.info("Alert terms updated successfully", {
      socketId: socket.id,
      alertBufferSize: refreshedAlerts.length,
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
 *
 * STATE-02: encapsulated in a small factory (rather than a bare `let`) so
 * the mutable flag isn't a raw module-level export, and so tests get an
 * explicit reset hook instead of relying on the code's own finally-block
 * cleanup to happen to leave the flag false between test cases.
 */
function createAlertRegenState() {
  let inProgress = false;
  return {
    isInProgress: (): boolean => inProgress,
    setInProgress: (value: boolean): void => {
      inProgress = value;
    },
    reset: (): void => {
      inProgress = false;
    },
  };
}

const alertRegenState = createAlertRegenState();

/** Test-only reset hook for alertRegenState — see STATE-02. */
export function resetAlertRegenStateForTesting(): void {
  alertRegenState.reset();
}

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
export function handleRegenerateAlertMatches(
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

  if (alertRegenState.isInProgress()) {
    logger.warn("Alert regeneration already in progress", {
      socketId: socket.id,
    });
    socket.emit("regenerate_alert_matches_error", {
      error: "Alert regeneration already in progress",
    });
    return;
  }

  alertRegenState.setInProgress(true);

  logger.info("Starting alert match regeneration", { socketId: socket.id });

  // Acknowledge immediately so the client knows work has started
  socket.emit("regenerate_alert_matches_started", {
    message: "Alert regeneration started in background",
  });

  // Defer the heavy synchronous work so Socket.IO can flush the started event
  // before the DB work blocks the event loop (mirrors Python's background task)
  //
  // The inner try/catch/finally handles the expected regeneration-failure
  // path, but if that catch/finally block *itself* throws (e.g. socket.emit
  // failing because the client disconnected mid-run), the outer async
  // function's returned promise would reject with nothing awaiting it —
  // an unhandled rejection at process level (ERR-02). Explicitly catch the
  // IIFE's promise as a backstop so that can never happen.
  setImmediate(() => {
    void (async () => {
      try {
        const startTime = performance.now();
        const alertTerms = getCachedAlertTerms();
        const alertIgnoreTerms = getCachedAlertIgnoreTerms();
        const stats = regenerateAllAlertMatches(alertTerms, alertIgnoreTerms);

        // Reheat ring buffers so alert cache reflects the regenerated matches.
        // regenerateAllAlertMatches() no longer calls reheatMessageBuffers()
        // internally — the socket handler owns the full sequence so it can
        // broadcast the result to clients after the await completes.
        await reheatMessageBuffers();

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

        // Broadcast refreshed alert content to all connected clients so their
        // alert pages update without requiring a reconnect.
        const refreshedAlerts = getRecentAlerts();
        io.of("/main").emit("alerts_refreshed", { messages: refreshedAlerts });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error("Error during alert match regeneration", {
          socketId: socket.id,
          error: message,
        });
        socket.emit("regenerate_alert_matches_error", { error: message });
      } finally {
        alertRegenState.setInProgress(false);
      }
    })().catch((error: unknown) => {
      logger.error(
        "Unhandled error in alert match regeneration background task",
        {
          socketId: socket.id,
          error: error instanceof Error ? error.message : String(error),
        },
      );
      alertRegenState.setInProgress(false);
    });
  });
}

/**
 * Handle alert term query
 *
 * Mirrors Python: @socketio.on("alert_term_query", namespace="/main")
 */
export function handleAlertTermQuery(
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
      limit: SEARCH_PAGE_SIZE,
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
export function handleQueryAlertsByTerm(
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
      SEARCH_PAGE_SIZE,
      (params.page ?? 0) * SEARCH_PAGE_SIZE,
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
 * Handle request_recent_alerts request
 *
 * Python implementation: acarshub.py handle_recent_alerts_request()
 * Emits `recent_alerts` with all current alert matches to the requesting client.
 *
 * This is an on-demand refresh — the client asks for alerts after navigation
 * or a page reload, so it receives the current alert cache without waiting
 * for a full reconnect.
 *
 * @param socket - Socket.IO socket
 */
export function handleRequestRecentAlerts(socket: TypedSocket): void {
  try {
    // Use the ring buffer — same authoritative source as handleConnect —
    // instead of querying the DB directly and re-enriching.
    const alerts = getRecentAlerts();

    socket.emit("recent_alerts", { alerts });

    logger.debug("Recent alerts sent on demand", {
      socketId: socket.id,
      count: alerts.length,
    });
  } catch (error) {
    logger.error("Failed to send recent alerts", {
      socketId: socket.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
