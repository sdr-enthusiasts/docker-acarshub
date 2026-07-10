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
 * Socket.IO database-search handler (GOD-01 split from socket/handlers.ts)
 */

import type { CurrentSearch, SearchHtmlMsg } from "@acarshub/types";
import { SEARCH_PAGE_SIZE } from "../../config.js";
import { databaseSearch } from "../../db/index.js";
import type { SearchParams } from "../../db/queries/messages.js";
import { enrichMessages } from "../../formatters/enrichment.js";
import { createLogger } from "../../utils/logger.js";
import type { TypedSocket } from "../types.js";

const logger = createLogger("socket:handlers-search");

/**
 * Handle database search query
 *
 * Mirrors Python: @socketio.on("query_search", namespace="/main")
 */
export function handleQuerySearch(
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
    const limit = SEARCH_PAGE_SIZE;
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
