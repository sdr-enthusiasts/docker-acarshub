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
// EFFECT-04: extracted from pages/AlertsPage.tsx.
//
// Owns AlertsPage's "historical mode" search: the Socket.IO listener for
// alerts_by_term_results, and the effect that fires a new query whenever the
// selected term or requested page changes. Bundled together (rather than
// split into a "subscription" hook + a "trigger" hook, unlike SearchPage's
// analogous split in EFFECT-03) because the results handler needs to write
// back `historicalPage` from the server's response (data.page) — the two
// concerns share that piece of state, so keeping them in one hook avoids a
// setter needing to flow between two sibling hooks.
// ----------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { socketService } from "../services/socket";
import type { AcarsMsg } from "../types";
import { uiLogger } from "../utils/logger";

export type AlertsViewMode = "live" | "historical";

export interface UseAlertsHistoricalSearchOptions {
  viewMode: AlertsViewMode;
  selectedTerm: string;
  historicalPage: number;
  setHistoricalPage: (page: number) => void;
}

export interface UseAlertsHistoricalSearchResult {
  historicalResults: AcarsMsg[];
  historicalTotal: number;
  queryTime: number | null;
  isSearching: boolean;
}

export function useAlertsHistoricalSearch({
  viewMode,
  selectedTerm,
  historicalPage,
  setHistoricalPage,
}: UseAlertsHistoricalSearchOptions): UseAlertsHistoricalSearchResult {
  const [historicalResults, setHistoricalResults] = useState<AcarsMsg[]>([]);
  const [historicalTotal, setHistoricalTotal] = useState(0);
  const [queryTime, setQueryTime] = useState<number | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  // Socket listener for historical alerts results
  useEffect(() => {
    if (!socketService.isInitialized()) {
      return;
    }

    const socket = socketService.getSocket();

    const handleHistoricalResults = (data: {
      total_count: number;
      messages: AcarsMsg[];
      term: string;
      page: number;
      query_time: number;
    }) => {
      // Backend already enriches messages with decodedText
      setHistoricalResults(data.messages);
      setHistoricalTotal(data.total_count);
      setHistoricalPage(data.page);
      setQueryTime(data.query_time);
      setIsSearching(false);

      uiLogger.info("Received historical alerts results", {
        term: data.term,
        page: data.page,
        count: data.messages.length,
        total: data.total_count,
        queryTime: data.query_time,
      });
    };

    socket.on("alerts_by_term_results", handleHistoricalResults);

    return () => {
      socket.off("alerts_by_term_results", handleHistoricalResults);
    };
  }, [setHistoricalPage]);

  // Execute historical search when term or page changes
  useEffect(() => {
    if (viewMode === "historical" && selectedTerm) {
      setIsSearching(true);
      socketService.queryAlertsByTerm(selectedTerm, historicalPage);
    }
  }, [viewMode, selectedTerm, historicalPage]);

  return { historicalResults, historicalTotal, queryTime, isSearching };
}
