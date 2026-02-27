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

import { useVirtualizer } from "@tanstack/react-virtual";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { MessageCard } from "../components/MessageCard";
import { MessageGroup } from "../components/MessageGroup";
import { socketService } from "../services/socket";
import { useAppStore } from "../store/useAppStore";
import type { AcarsMsg } from "../types";

import { uiLogger } from "../utils/logger";

const RESULTS_PER_PAGE = 50;

type ViewMode = "live" | "historical";

/**
 * Estimated height in pixels for an alert item that has not yet been measured.
 *
 * WHY 300 px: alert cards share the same variable-height profile as live-
 * message cards (roughly 100 px minimal to 600 px+ for libacars payloads).
 * Biasing high means the initial estimate overshoots slightly downward so
 * the user's viewport drifts down rather than snapping back toward the top
 * when items are later measured at their real height.
 */
const ESTIMATED_ITEM_HEIGHT = 300;

/**
 * Virtual padding above the first item in both modes (px).
 * Provides breathing room at the top of the list. Acts as the scroll-anchor
 * threshold — the user is considered "at the top" when scrollTop is inside
 * this zone, so live prepends flow in naturally without anchoring.
 */
const LIST_PADDING_START = 16;

/**
 * AlertsPage Component
 * Displays messages that match configured alert terms
 *
 * Features:
 * - Live mode: Shows real-time messages with alert matches (virtualized)
 * - Historical mode: Search past alerts by specific term with pagination (virtualized)
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

  // ---------------------------------------------------------------------------
  // Virtual list infrastructure
  // ---------------------------------------------------------------------------

  /**
   * Scroll container ref — the element that has overflow-y: auto and whose
   * scrollTop the virtualizer observes.
   */
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  /**
   * Per-group active tab index in live mode, keyed by group stable key.
   *
   * WHY a ref: tab clicks must not re-render every other group. The ref is
   * mutated directly; each MessageGroup reads its own value on (re-)mount.
   */
  const activeTabIndices = useRef<Map<string, number>>(new Map());

  /**
   * Total virtual size from the previous render, used by scroll anchoring.
   */
  const prevLiveTotalSize = useRef(0);

  /**
   * Height of the virtual scroll container in pixels, measured via
   * ResizeObserver so it exactly fills the remaining viewport below the
   * page header and controls bar without any hardcoded pixel values.
   */
  const [listHeight, setListHeight] = useState(() =>
    typeof window !== "undefined"
      ? Math.max(window.innerHeight - 200, 300)
      : 400,
  );

  // Dynamically measure the available height for the virtual scroll container.
  useEffect(() => {
    const scrollEl = scrollContainerRef.current;
    if (!scrollEl) return;

    const measure = () => {
      const rect = scrollEl.getBoundingClientRect();
      const available = window.innerHeight - rect.top;
      setListHeight(Math.max(available, 200));
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(scrollEl);
    window.addEventListener("resize", measure);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

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

  // Scroll to top when the user switches modes, changes the selected term,
  // or navigates to a different historical page.
  // biome-ignore lint/correctness/useExhaustiveDependencies: viewMode, selectedTerm, and historicalPage are intentional trigger dependencies — the effect reads scrollContainerRef (a stable ref) but must fire whenever these values change to reset the scroll position.
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
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

  // ---------------------------------------------------------------------------
  // Live mode virtualizer — MessageGroup items (variable height, unbounded list)
  // ---------------------------------------------------------------------------
  const liveVirtualizer = useVirtualizer({
    count: viewMode === "live" ? alertGroupsArray.length : 0,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => ESTIMATED_ITEM_HEIGHT,
    overscan: 3,
    // Stable key per group so the height cache survives prepends/reorders.
    getItemKey: (index) => {
      const group = alertGroupsArray[index];
      return (
        group?.messages[0]?.uid ??
        group?.identifiers.join("-") ??
        `live-${index}`
      );
    },
    paddingStart: LIST_PADDING_START,
  });

  // ---------------------------------------------------------------------------
  // Historical mode virtualizer — MessageCard items (paginated, up to 50)
  // ---------------------------------------------------------------------------
  const histVirtualizer = useVirtualizer({
    count: viewMode === "historical" ? historicalResults.length : 0,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => ESTIMATED_ITEM_HEIGHT,
    overscan: 3,
    getItemKey: (index) => historicalResults[index]?.uid ?? `hist-${index}`,
    paddingStart: LIST_PADDING_START,
  });

  // ---------------------------------------------------------------------------
  // Scroll anchoring for live mode
  //
  // When the virtual size changes (new prepend or height remeasurement) AND
  // the user has scrolled past the padding zone, adjust scrollTop by the same
  // delta so the currently-visible content does not appear to jump.
  //
  // Historical mode skips anchoring because results replace entirely on each
  // page change — the scroll-to-top effect above handles that reset.
  // ---------------------------------------------------------------------------
  useLayoutEffect(() => {
    if (viewMode !== "live") {
      prevLiveTotalSize.current = liveVirtualizer.getTotalSize();
      return;
    }

    const newTotalSize = liveVirtualizer.getTotalSize();
    const scrollEl = scrollContainerRef.current;

    if (scrollEl && scrollEl.scrollTop > LIST_PADDING_START) {
      const delta = newTotalSize - prevLiveTotalSize.current;
      if (delta !== 0) {
        scrollEl.scrollTop = Math.max(0, scrollEl.scrollTop + delta);
      }
    }

    prevLiveTotalSize.current = newTotalSize;
  });

  const handleMarkAllRead = useCallback(() => {
    markAllAlertsAsRead();
    uiLogger.info("User manually marked all alerts as read", {
      count: stats.unreadAlerts,
    });
  }, [markAllAlertsAsRead, stats.unreadAlerts]);

  const handleModeChange = useCallback(
    (mode: ViewMode) => {
      setViewMode(mode);
      if (mode === "historical" && alertTerms.terms.length > 0) {
        setSelectedTerm(alertTerms.terms[0]);
        setHistoricalPage(0);
      }
      uiLogger.debug("Alert view mode changed", { mode });
    },
    [alertTerms.terms],
  );

  const handleTermChange = useCallback((term: string) => {
    setSelectedTerm(term);
    setHistoricalPage(0);
  }, []);

  const handlePageChange = useCallback((newPage: number) => {
    setHistoricalPage(newPage);
  }, []);

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

  // ---------------------------------------------------------------------------
  // Derive display states
  // ---------------------------------------------------------------------------
  const noTermsConfigured = alertTerms.terms.length === 0;
  const liveHasGroups = alertGroupsArray.length > 0;
  const histHasResults = historicalResults.length > 0;

  return (
    <div className="page alerts-page">
      {/* Page Header */}
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

      {/* Page content — flex column so the controls bar and scroll container
          stack vertically and the scroll container fills remaining space */}
      <div className="page__content alerts-page__content">
        {/* Controls bar: mode toggle + optional term selector + pagination */}
        <div className="alerts-page__controls-bar">
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
              disabled={noTermsConfigured}
            >
              Historical
            </button>
          </div>

          {/* Historical term selector */}
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

          {/* Historical pagination — rendered above the list so it stays
              accessible regardless of scroll position */}
          {viewMode === "historical" && totalPages > 1 && (
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
        </div>

        {/* Virtual scroll container — always rendered so the ResizeObserver
            can measure it immediately.  Content inside varies by state. */}
        <div
          ref={scrollContainerRef}
          className="alerts-page__virtual-list"
          style={{ height: `${listHeight}px` }}
        >
          {/* ----------------------------------------------------------------
              LIVE MODE
          ----------------------------------------------------------------- */}
          {viewMode === "live" && noTermsConfigured && (
            <div className="alerts-page__empty-state">
              <div className="alerts-page__empty-state-content">
                <h2>No Alert Terms Configured</h2>
                <p>
                  Configure alert terms in Settings → Notifications to start
                  receiving alerts for specific keywords, aircraft, or flight
                  numbers.
                </p>
                <p className="text-muted">
                  Alert terms can match message text, callsigns, tail numbers,
                  or ICAO hex codes.
                </p>
              </div>
            </div>
          )}

          {viewMode === "live" && !noTermsConfigured && !liveHasGroups && (
            <div className="alerts-page__empty-state">
              <div className="alerts-page__empty-state-content">
                <h2>No Matching Messages</h2>
                <p>
                  No messages have been received that match your configured
                  alert terms.
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
          )}

          {/* Live virtual list */}
          {viewMode === "live" && liveHasGroups && (
            <div
              style={{
                height: `${liveVirtualizer.getTotalSize()}px`,
                width: "100%",
                position: "relative",
              }}
            >
              {liveVirtualizer.getVirtualItems().map((virtualRow) => {
                const group = alertGroupsArray[virtualRow.index];
                const key =
                  group.messages[0]?.uid ?? group.identifiers.join("-");
                const savedIndex = activeTabIndices.current.get(key) ?? 0;
                const clampedIndex = Math.min(
                  savedIndex,
                  group.messages.length - 1,
                );

                return (
                  <div
                    key={key}
                    data-index={virtualRow.index}
                    ref={liveVirtualizer.measureElement}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <div className="alerts-page__item">
                      <MessageGroup
                        plane={group}
                        showMarkReadButton={true}
                        activeIndex={clampedIndex}
                        onActiveIndexChange={(index) => {
                          activeTabIndices.current.set(key, index);
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ----------------------------------------------------------------
              HISTORICAL MODE
          ----------------------------------------------------------------- */}
          {viewMode === "historical" && isSearching && (
            <div className="alerts-page__loading">
              <p>Searching...</p>
            </div>
          )}

          {viewMode === "historical" && !isSearching && !histHasResults && (
            <div className="alerts-page__empty-state">
              <div className="alerts-page__empty-state-content">
                <h2>No Historical Results</h2>
                <p>
                  No messages found matching alert term:{" "}
                  <strong>{selectedTerm}</strong>
                </p>
              </div>
            </div>
          )}

          {/* Historical virtual list */}
          {viewMode === "historical" && !isSearching && histHasResults && (
            <div
              style={{
                height: `${histVirtualizer.getTotalSize()}px`,
                width: "100%",
                position: "relative",
              }}
            >
              {histVirtualizer.getVirtualItems().map((virtualRow) => {
                const message = historicalResults[virtualRow.index];

                return (
                  <div
                    key={message.uid}
                    data-index={virtualRow.index}
                    ref={histVirtualizer.measureElement}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <div className="alerts-page__item">
                      <div className="alerts-page__result-card">
                        <MessageCard
                          message={message}
                          showMarkReadButton={false}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
