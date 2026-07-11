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

// ----------------------------------------------------------------------------
// EFFECT-03: extracted from pages/SearchPage.tsx.
//
// Registers the Socket.IO listener for database_search_results and routes
// incoming payloads into the page's results/pagination state. Waits for the
// socket service to be initialized before subscribing (it may not be ready
// yet on the very first render).
// ----------------------------------------------------------------------------

import { useEffect } from "react";
import { socketService } from "../services/socket";
import type { AcarsMsg, SearchHtmlMsg } from "../types";
import { uiLogger } from "../utils/logger";

export interface UseSearchResultsSubscriptionOptions {
  setResults: (results: AcarsMsg[]) => void;
  setTotalResults: (count: number) => void;
  setQueryTime: (time: number | null) => void;
  setIsSearching: (searching: boolean) => void;
}

export function useSearchResultsSubscription({
  setResults,
  setTotalResults,
  setQueryTime,
  setIsSearching,
}: UseSearchResultsSubscriptionOptions): void {
  useEffect(() => {
    const handleSearchResults = (data: SearchHtmlMsg) => {
      // Backend already enriches messages with decodedText
      setResults(data.msghtml);
      setTotalResults(data.num_results);
      setQueryTime(data.query_time);
      setIsSearching(false);
      // Form collapse is scroll-driven — results arriving do not collapse the
      // form.  The user scrolls down to browse results and the form collapses
      // naturally once it leaves the viewport.
    };

    // Check if socket service is initialized
    if (!socketService.isInitialized()) {
      uiLogger.debug("Socket not initialized yet, waiting for connection");
      return () => {};
    }

    try {
      const socket = socketService.getSocket();
      socket.on("database_search_results", handleSearchResults);
      uiLogger.debug("Subscribed to database_search_results event");

      return () => {
        socket.off("database_search_results", handleSearchResults);
        uiLogger.debug("Unsubscribed from database_search_results event");
      };
    } catch (error) {
      uiLogger.warn("Failed to subscribe to search results", { error });
      return () => {};
    }
  }, [setResults, setTotalResults, setQueryTime, setIsSearching]);
}
