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

import { useEffect, useMemo, useState } from "react";
import { MessageCard } from "../components/MessageCard";
import { MessageGroup } from "../components/MessageGroup";
import { socketService } from "../services/socket";
import { useAppStore } from "../store/useAppStore";
import type { AcarsMsg } from "../types";
import { decodeMessages } from "../utils/decoderUtils";
import { uiLogger } from "../utils/logger";

const RESULTS_PER_PAGE = 50;

type ViewMode = "live" | "historical";

/**
 * AlertsPage Component
 * Displays messages that match configured alert terms
 *
 * Features:
 * - Live mode: Shows real-time messages with alert matches
 * - Historical mode: Search past alerts by specific term with pagination
 * - Sound notifications for new alerts (handled by global AlertSoundManager)
 * - Statistics (unread/total alerts, unique aircraft)
 * - Manual "Mark All Read" button
 * - Individual "Mark Read" buttons per message
 * - Mobile-first responsive design
 */
export const AlertsPage = () => {
  // View mode state
  const [viewMode, setViewMode] = useState<ViewMode>("live");
  const [selectedTerm, setSelectedTerm] = useState<string>("");
  const [historicalResults, setHistoricalResults] = useState<AcarsMsg[]>([]);
  const [historicalTotal, setHistoricalTotal] = useState(0);
  const [historicalPage, setHistoricalPage] = useState(0);
  const [queryTime, setQueryTime] = useState<number | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const setCurrentPage = useAppStore((state) => state.setCurrentPage);
  const alertMessageGroups = useAppStore((state) => state.alertMessageGroups);
  const alertTerms = useAppStore((state) => state.alertTerms);
  const readMessageUids = useAppStore((state) => state.readMessageUids);
  const markAllAlertsAsRead = useAppStore((state) => state.markAllAlertsAsRead);

  // Count total alert messages, unread alerts, and unique aircraft
  const stats = useMemo(() => {
    let totalAlerts = 0;
    let unreadAlerts = 0;
    const uniqueAircraft = new Set<string>();

    for (const group of alertMessageGroups.values()) {
      totalAlerts += group.messages.length;
      // Use first identifier as unique key
      if (group.identifiers.length > 0) {
        uniqueAircraft.add(group.identifiers[0]);
      }
      // Count unread alerts
      for (const message of group.messages) {
        if (!readMessageUids.has(message.uid)) {
          unreadAlerts++;
        }
      }
    }

    uiLogger.debug("AlertsPage stats recalculated", {
      totalAlerts,
      unreadAlerts,
      uniqueAircraft: uniqueAircraft.size,
      groupCount: alertMessageGroups.size,
    });

    return {
      totalAlerts,
      unreadAlerts,
      uniqueAircraft: uniqueAircraft.size,
    };
  }, [alertMessageGroups, readMessageUids]);

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
      // Decode messages that don't have decodedText from database
      const decodedResults = decodeMessages(data.messages);
      setHistoricalResults(decodedResults);
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
  }, []);

  useEffect(() => {
    setCurrentPage("Alerts");
    socketService.notifyPageChange("Alerts");
    uiLogger.info("Alerts page loaded", {
      viewMode,
      termCount: alertTerms.terms.length,
      ignoreCount: alertTerms.ignore.length,
      alertGroups: alertMessageGroups.size,
      unreadAlerts: stats.unreadAlerts,
    });
  }, [
    setCurrentPage,
    alertTerms,
    alertMessageGroups.size,
    stats.unreadAlerts,
    viewMode,
  ]);

  // Execute historical search when term or page changes
  useEffect(() => {
    if (viewMode === "historical" && selectedTerm) {
      setIsSearching(true);
      socketService.queryAlertsByTerm(selectedTerm, historicalPage);
    }
  }, [viewMode, selectedTerm, historicalPage]);

  // Convert messageGroups Map to array and sort by most recent message (newest first)
  const alertGroupsArray = useMemo(() => {
    const groups = Array.from(alertMessageGroups.values());
    const sorted = groups.sort((a, b) => {
      // Use lastUpdated field which tracks the most recent message timestamp
      const aTimestamp = a.lastUpdated || 0;
      const bTimestamp = b.lastUpdated || 0;
      // Sort descending (newest first)
      return bTimestamp - aTimestamp;
    });

    uiLogger.debug("AlertsPage groups recalculated", {
      groupCount: sorted.length,
      firstGroupId: sorted[0]?.identifiers[0] || "none",
      firstGroupLastUpdated: sorted[0]?.lastUpdated || 0,
    });

    return sorted;
  }, [alertMessageGroups]);

  const handleMarkAllRead = () => {
    markAllAlertsAsRead();
    uiLogger.info("User manually marked all alerts as read", {
      count: stats.unreadAlerts,
    });
  };

  const handleModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    if (mode === "historical" && alertTerms.terms.length > 0) {
      setSelectedTerm(alertTerms.terms[0]);
      setHistoricalPage(0);
    }
    uiLogger.debug("Alert view mode changed", { mode });
  };

  const handleTermChange = (term: string) => {
    setSelectedTerm(term);
    setHistoricalPage(0);
  };

  const handlePageChange = (newPage: number) => {
    setHistoricalPage(newPage);
  };

  // Calculate total pages for historical view
  const totalPages = Math.ceil(historicalTotal / RESULTS_PER_PAGE);

  // Generate page numbers with ellipsis
  const pageNumbers = useMemo(() => {
    const pages: (number | "ellipsis")[] = [];
    const maxVisible = 7;

    if (totalPages <= maxVisible) {
      for (let i = 0; i < totalPages; i++) {
        pages.push(i);
      }
    } else {
      if (historicalPage < 3) {
        for (let i = 0; i < 5; i++) pages.push(i);
        pages.push("ellipsis");
        pages.push(totalPages - 1);
      } else if (historicalPage > totalPages - 4) {
        pages.push(0);
        pages.push("ellipsis");
        for (let i = totalPages - 5; i < totalPages; i++) pages.push(i);
      } else {
        pages.push(0);
        pages.push("ellipsis");
        for (let i = historicalPage - 1; i <= historicalPage + 1; i++)
          pages.push(i);
        pages.push("ellipsis");
        pages.push(totalPages - 1);
      }
    }

    return pages;
  }, [totalPages, historicalPage]);

  return (
    <div className="page alerts-page">
      <div className="page__header">
        <h1 className="page__title">Alerts</h1>

        <div className="page__stats">
          {viewMode === "live" ? (
            <>
              <span className="stat">
                <strong>{stats.unreadAlerts}</strong> unread
              </span>
              <span className="stat-separator">|</span>
              <span className="stat">
                <strong>{stats.totalAlerts}</strong> total alert
                {stats.totalAlerts !== 1 ? "s" : ""}
              </span>
              <span className="stat-separator">|</span>
              <span className="stat">
                <strong>{stats.uniqueAircraft}</strong> aircraft
              </span>
              {stats.unreadAlerts > 0 && (
                <>
                  <span className="stat-separator">|</span>
                  <button
                    type="button"
                    onClick={handleMarkAllRead}
                    className="alerts-page__mark-read-button"
                    title="Mark all alerts as read"
                  >
                    Mark All Read
                  </button>
                </>
              )}
            </>
          ) : (
            <>
              <span className="stat">
                <strong>{historicalTotal}</strong> result
                {historicalTotal !== 1 ? "s" : ""}
              </span>
              {queryTime !== null && (
                <>
                  <span className="stat-separator">|</span>
                  <span className="stat">
                    Query time:{" "}
                    <strong>{(queryTime * 1000).toFixed(0)}ms</strong>
                  </span>
                </>
              )}
            </>
          )}
        </div>
      </div>

      <div className="page__content">
        {/* Mode Toggle */}
        <div className="alerts-page__mode-toggle">
          <button
            type="button"
            onClick={() => handleModeChange("live")}
            className={`alerts-page__mode-button ${viewMode === "live" ? "alerts-page__mode-button--active" : ""}`}
          >
            Live
          </button>
          <button
            type="button"
            onClick={() => handleModeChange("historical")}
            className={`alerts-page__mode-button ${viewMode === "historical" ? "alerts-page__mode-button--active" : ""}`}
            disabled={alertTerms.terms.length === 0}
          >
            Historical
          </button>
        </div>

        {viewMode === "historical" && (
          <div className="alerts-page__controls">
            <div className="alerts-page__term-selector">
              <label
                htmlFor="alert-term-select"
                className="alerts-page__term-label"
              >
                Select Alert Term:
              </label>
              <select
                id="alert-term-select"
                value={selectedTerm}
                onChange={(e) => handleTermChange(e.target.value)}
                className="alerts-page__term-select"
              >
                {alertTerms.terms.map((term) => (
                  <option key={term} value={term}>
                    {term}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {viewMode === "live" && alertTerms.terms.length === 0 ? (
          <div className="alerts-page__empty-state">
            <div className="alerts-page__empty-state-content">
              <h2>No Alert Terms Configured</h2>
              <p>
                Configure alert terms in Settings → Notifications to start
                receiving alerts for specific keywords, aircraft, or flight
                numbers.
              </p>
              <p className="text-muted">
                Alert terms can match message text, callsigns, tail numbers, or
                ICAO hex codes.
              </p>
            </div>
          </div>
        ) : viewMode === "live" && stats.totalAlerts === 0 ? (
          <div className="alerts-page__empty-state">
            <div className="alerts-page__empty-state-content">
              <h2>No Matching Messages</h2>
              <p>
                No messages have been received that match your configured alert
                terms.
              </p>
              <div className="alerts-page__current-terms">
                <h3>Active Alert Terms</h3>
                <div className="alerts-page__term-list">
                  {alertTerms.terms.map((term) => (
                    <span key={term} className="alerts-page__term-badge">
                      {term}
                    </span>
                  ))}
                </div>
                {alertTerms.ignore.length > 0 && (
                  <>
                    <h3>Ignore Terms</h3>
                    <div className="alerts-page__term-list">
                      {alertTerms.ignore.map((term) => (
                        <span
                          key={term}
                          className="alerts-page__term-badge alerts-page__term-badge--ignore"
                        >
                          {term}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        ) : viewMode === "live" ? (
          <div className="alerts-page__messages">
            {alertGroupsArray.map((plane) => (
              <MessageGroup
                key={plane.identifiers[0] || "unknown"}
                plane={plane}
                showMarkReadButton={true}
              />
            ))}
          </div>
        ) : isSearching ? (
          <div className="alerts-page__loading">
            <p>Searching...</p>
          </div>
        ) : historicalResults.length === 0 ? (
          <div className="alerts-page__empty-state">
            <div className="alerts-page__empty-state-content">
              <h2>No Historical Results</h2>
              <p>
                No messages found matching alert term:{" "}
                <strong>{selectedTerm}</strong>
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="alerts-page__messages">
              {historicalResults.map((message) => (
                <div key={message.uid} className="alerts-page__result-card">
                  <MessageCard message={message} showMarkReadButton={false} />
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="alerts-page__pagination">
                <button
                  type="button"
                  onClick={() => handlePageChange(historicalPage - 1)}
                  disabled={historicalPage === 0}
                  className="alerts-page__page-button"
                >
                  Previous
                </button>

                <div className="alerts-page__page-numbers">
                  {pageNumbers.map((page, idx) => {
                    if (page === "ellipsis") {
                      // Use position context for unique key (first ellipsis vs second ellipsis)
                      const position = idx < totalPages / 2 ? "start" : "end";
                      return (
                        <span
                          key={`ellipsis-${position}`}
                          className="alerts-page__ellipsis"
                        >
                          ...
                        </span>
                      );
                    }
                    return (
                      <button
                        key={page}
                        type="button"
                        onClick={() => handlePageChange(page)}
                        className={`alerts-page__page-button ${
                          historicalPage === page
                            ? "alerts-page__page-button--active"
                            : ""
                        }`}
                      >
                        {page + 1}
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={() => handlePageChange(historicalPage + 1)}
                  disabled={historicalPage >= totalPages - 1}
                  className="alerts-page__page-button"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
