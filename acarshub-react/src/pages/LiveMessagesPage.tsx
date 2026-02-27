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
import { MessageFilters } from "../components/MessageFilters";
import { MessageGroup as MessageGroupComponent } from "../components/MessageGroup";
import { socketService } from "../services/socket";
import { useAppStore } from "../store/useAppStore";
import type {
  AcarsMsg,
  Labels,
  MessageGroup as MessageGroupType,
} from "../types";

// Global filter state for Navigation access
let globalFilterProps: {
  labels: Labels;
  excludedLabels: string[];
  onExcludedLabelsChange: (labels: string[]) => void;
  filterNoText: boolean;
  onFilterNoTextChange: (enabled: boolean) => void;
  isPaused: boolean;
  onPauseChange: (paused: boolean) => void;
  textFilter: string;
  onTextFilterChange: (text: string) => void;
  showAlertsOnly: boolean;
  onShowAlertsOnlyChange: (enabled: boolean) => void;
  stationIds: string[];
  selectedStationIds: string[];
  onSelectedStationIdsChange: (ids: string[]) => void;
} | null = null;

export function getMessageFilterProps() {
  return globalFilterProps;
}

/**
 * LiveMessagesPage Component
 * Displays real-time ACARS messages as they arrive from aircraft
 *
 * Features:
 * - Real-time message updates via Socket.IO
 * - Filtering by text, label, and alerts
 * - Pause/resume functionality
 * - Statistics (received, filtered, alerts)
 * - Virtualized list for performance with 50+ aircraft
 *
 * Design Notes:
 * - Messages stored in Zustand global store
 * - Local state for UI filters (pause, text search, excluded labels)
 * - Filters persist to localStorage
 * - Mobile-first responsive layout
 */
export const LiveMessagesPage = () => {
  const messageGroups = useAppStore((state) => state.messageGroups);
  const labels = useAppStore((state) => state.labels);
  const stationIds = useAppStore((state) => state.stationIds);
  const setCurrentPage = useAppStore((state) => state.setCurrentPage);

  // Frozen message groups snapshot when paused
  // This stores the message group state at the moment pause was activated
  const [frozenMessageGroups, setFrozenMessageGroups] = useState<
    Map<string, MessageGroupType>
  >(new Map());

  // Filter state (persisted to localStorage)
  const [isPaused, setIsPaused] = useState(() => {
    const saved = localStorage.getItem("liveMessages.isPaused");
    return saved === "true";
  });

  const [filterNoText, setFilterNoText] = useState(() => {
    const saved = localStorage.getItem("liveMessages.filterNoText");
    return saved === "true";
  });

  const [excludedLabels, setExcludedLabels] = useState<string[]>(() => {
    const saved = localStorage.getItem("liveMessages.excludedLabels");
    return saved ? JSON.parse(saved) : [];
  });

  const [textFilter, setTextFilter] = useState("");
  const [showAlertsOnly, setShowAlertsOnly] = useState(false);

  const [selectedStationIds, setSelectedStationIds] = useState<string[]>(() => {
    const saved = localStorage.getItem("liveMessages.selectedStationIds");
    return saved ? (JSON.parse(saved) as string[]) : [];
  });

  // Statistics state
  const [totalReceived, setTotalReceived] = useState(0);

  // ---------------------------------------------------------------------------
  // Virtual list infrastructure
  // ---------------------------------------------------------------------------

  /**
   * Ref attached to the top-level page div. A ResizeObserver watches this
   * element so we can compute the exact remaining viewport height available
   * to the virtual scroll container, accounting for any nav bar height,
   * page header height, or filter bar height without hardcoding pixel values.
   */
  const pageRef = useRef<HTMLDivElement>(null);

  /**
   * Scroll container ref — the div that wraps the virtual list and has
   * overflow-y: auto. The virtualizer uses this element's scrollTop/clientHeight
   * to determine which items are in view.
   */
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  /**
   * Height of the virtual scroll container in pixels.
   *
   * WHY dynamic measurement instead of CSS calc(100vh - nav-height):
   * The nav height varies between mobile/desktop, and the page header +
   * filter bar also consume vertical space. Measuring with ResizeObserver
   * gives the exact remaining height without any hardcoded pixel values or
   * CSS variable bookkeeping.
   *
   * Initial value: a reasonable fraction of the viewport so the first render
   * isn't completely empty while the effect hasn't run yet.
   */
  const [listHeight, setListHeight] = useState(() =>
    typeof window !== "undefined"
      ? Math.max(window.innerHeight - 200, 300)
      : 400,
  );

  /**
   * Per-group active tab index, keyed by group stable key (first message UID).
   *
   * WHY a ref instead of state: we don't want a tab click in one MessageGroup
   * to trigger a re-render of every other visible group. The ref is mutated
   * directly; the individual MessageGroup reads its own value on mount (when
   * the virtualizer re-mounts it after scrolling back into view).
   */
  const activeTabIndices = useRef<Map<string, number>>(new Map());

  /**
   * The total virtual height from the previous render, used by the scroll-
   * anchor useLayoutEffect to calculate how much new content was added above
   * the viewport and compensate scrollTop accordingly.
   */
  const prevTotalSize = useRef(0);

  /**
   * The key of the first item in filteredMessageGroups from the previous render.
   * A change here (combined with the list growing) means items were prepended.
   */
  const prevFirstKey = useRef<string | null>(null);

  // Persist filter settings to localStorage
  useEffect(() => {
    localStorage.setItem("liveMessages.isPaused", String(isPaused));
  }, [isPaused]);

  useEffect(() => {
    localStorage.setItem("liveMessages.filterNoText", String(filterNoText));
  }, [filterNoText]);

  useEffect(() => {
    localStorage.setItem(
      "liveMessages.excludedLabels",
      JSON.stringify(excludedLabels),
    );
  }, [excludedLabels]);

  useEffect(() => {
    localStorage.setItem(
      "liveMessages.selectedStationIds",
      JSON.stringify(selectedStationIds),
    );
  }, [selectedStationIds]);

  // Notify page change
  useEffect(() => {
    setCurrentPage("Live Messages");
    socketService.notifyPageChange("Live Messages");
  }, [setCurrentPage]);

  // Dynamically measure the height available for the virtual scroll container.
  //
  // WHY ResizeObserver instead of CSS calc():
  // The nav bar, page header, and filter bar all consume vertical space above
  // the message list. Their heights vary between mobile and desktop breakpoints
  // and change when filters are shown/hidden. A ResizeObserver on the scroll
  // container itself measures the actual available space after all the above
  // elements have been laid out, without requiring any hardcoded pixel values.
  useEffect(() => {
    const scrollEl = scrollContainerRef.current;
    if (!scrollEl) return;

    const measure = () => {
      const rect = scrollEl.getBoundingClientRect();
      // Available height = distance from the top of the scroll container
      // to the bottom of the viewport. No buffer needed: overflow:hidden on
      // .app-content (set via CSS :has selector) silently clips any subpixel
      // overshoot so there is no risk of an outer scrollbar appearing.
      const available = window.innerHeight - rect.top;
      setListHeight(Math.max(available, 200));
    };

    measure();

    // Re-measure when the scroll container's size changes (e.g. filter bar
    // toggled, window resized, orientation change).
    const ro = new ResizeObserver(measure);
    ro.observe(scrollEl);
    window.addEventListener("resize", measure);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  // Keyboard shortcut: 'p' to toggle pause
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore if user is typing in an input field
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (event.key === "p" || event.key === "P") {
        event.preventDefault();
        setIsPaused((prev) => {
          if (!prev) {
            // About to pause - capture current message group state
            setFrozenMessageGroups(new Map(messageGroups));
          }
          return !prev;
        });
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [messageGroups]);

  // Convert message groups Map to array and sort by newest first
  // Use frozen snapshot when paused, live message groups when not paused
  const messageGroupsArray = useMemo(() => {
    const sourceGroups = isPaused ? frozenMessageGroups : messageGroups;
    return Array.from(sourceGroups.values()).sort((a, b) => {
      const aTime = a.messages[0]?.timestamp || 0;
      const bTime = b.messages[0]?.timestamp || 0;
      return bTime - aTime; // Newest first
    });
  }, [messageGroups, isPaused, frozenMessageGroups]);

  // Filter message groups based on current filter settings
  const filteredMessageGroups = useMemo(() => {
    let filtered = messageGroupsArray;

    // Filter by alerts only
    if (showAlertsOnly) {
      filtered = filtered.filter((group) => group.has_alerts);
    }

    // Filter by selected station IDs — keep groups that have at least one
    // message from a selected station; within those groups, keep only the
    // messages that match the selection.
    if (selectedStationIds.length > 0) {
      const stationSet = new Set(selectedStationIds);
      filtered = filtered
        .map((group) => {
          const filteredMessages = group.messages.filter(
            (msg: AcarsMsg) => msg.station_id && stationSet.has(msg.station_id),
          );
          if (filteredMessages.length === 0) return null;
          return {
            ...group,
            messages: filteredMessages,
            has_alerts: filteredMessages.some((msg: AcarsMsg) => msg.matched),
            num_alerts: filteredMessages.filter((msg: AcarsMsg) => msg.matched)
              .length,
          } as MessageGroupType;
        })
        .filter((group): group is MessageGroupType => group !== null);
    }

    // Filter by text search - filter messages within groups
    if (textFilter.trim()) {
      const searchLower = textFilter.toLowerCase().trim();
      filtered = filtered
        .map((group) => {
          // Check if any identifier matches
          const identifierMatches = group.identifiers.some((id: string) =>
            id.toLowerCase().includes(searchLower),
          );

          // If identifier matches, show all messages for this group
          if (identifierMatches) {
            return group;
          }

          // Otherwise, filter messages to only those that match search
          const filteredMessages = group.messages.filter((msg: AcarsMsg) => {
            // Helper function to check if a string field contains search text
            const fieldMatches = (
              field: string | undefined | null,
              _fieldName: string,
            ): boolean => {
              if (!field || typeof field !== "string") return false;
              return field.toLowerCase().includes(searchLower);
            };

            // Helper function to check if a number field contains search text
            const numberMatches = (
              field: number | undefined | null,
              _fieldName: string,
            ): boolean => {
              if (field === undefined || field === null) return false;
              return field.toString().toLowerCase().includes(searchLower);
            };

            return (
              // Message content
              fieldMatches(msg.text, "text") ||
              fieldMatches(msg.data, "data") ||
              fieldMatches(msg.decoded_msg, "decoded_msg") ||
              fieldMatches(msg.libacars, "libacars") ||
              // Identifiers
              fieldMatches(msg.tail, "tail") ||
              fieldMatches(msg.flight, "flight") ||
              fieldMatches(msg.icao_flight, "icao_flight") ||
              fieldMatches(msg.iata_flight, "iata_flight") ||
              fieldMatches(msg.airline, "airline") ||
              fieldMatches(msg.flight_number, "flight_number") ||
              numberMatches(msg.icao, "icao") ||
              fieldMatches(msg.icao_hex, "icao_hex") ||
              // Message metadata
              fieldMatches(msg.label, "label") ||
              fieldMatches(msg.label_type, "label_type") ||
              // station_id removed - too common, matches everything from same ground station
              fieldMatches(msg.toaddr, "toaddr") ||
              fieldMatches(msg.toaddr_decoded, "toaddr_decoded") ||
              fieldMatches(msg.toaddr_hex, "toaddr_hex") ||
              fieldMatches(msg.fromaddr, "fromaddr") ||
              fieldMatches(msg.fromaddr_decoded, "fromaddr_decoded") ||
              fieldMatches(msg.fromaddr_hex, "fromaddr_hex") ||
              fieldMatches(msg.msgno, "msgno") ||
              fieldMatches(msg.msgno_parts, "msgno_parts") ||
              fieldMatches(msg.ack, "ack") ||
              fieldMatches(msg.mode, "mode") ||
              fieldMatches(msg.block_id, "block_id") ||
              fieldMatches(msg.message_type, "message_type") ||
              numberMatches(msg.freq, "freq") ||
              numberMatches(msg.level, "level") ||
              // Flight information
              fieldMatches(msg.depa, "depa") ||
              fieldMatches(msg.dsta, "dsta") ||
              fieldMatches(msg.eta, "eta") ||
              fieldMatches(msg.gtout, "gtout") ||
              fieldMatches(msg.gtin, "gtin") ||
              fieldMatches(msg.wloff, "wloff") ||
              fieldMatches(msg.wlin, "wlin") ||
              numberMatches(msg.lat, "lat") ||
              numberMatches(msg.lon, "lon") ||
              numberMatches(msg.alt, "alt")
            );
          });

          // If no messages remain, exclude the entire group
          if (filteredMessages.length === 0) {
            return null;
          }

          // Return group with filtered messages
          return {
            ...group,
            messages: filteredMessages,
            has_alerts: filteredMessages.some((msg: AcarsMsg) => msg.matched),
            num_alerts: filteredMessages.filter((msg: AcarsMsg) => msg.matched)
              .length,
          } as MessageGroupType;
        })
        .filter((group): group is MessageGroupType => group !== null);
    }

    // Filter by excluded labels
    if (excludedLabels.length > 0) {
      filtered = filtered
        .map((group) => {
          // Filter out messages with excluded labels
          const filteredMessages = group.messages.filter(
            (msg: AcarsMsg) =>
              !msg.label || !excludedLabels.includes(msg.label),
          );

          // If no messages remain, exclude the entire group
          if (filteredMessages.length === 0) {
            return null;
          }

          // Return group with filtered messages
          return {
            ...group,
            messages: filteredMessages,
            has_alerts: filteredMessages.some((msg: AcarsMsg) => msg.matched),
            num_alerts: filteredMessages.filter((msg: AcarsMsg) => msg.matched)
              .length,
          } as MessageGroupType;
        })
        .filter((group): group is MessageGroupType => group !== null);
    }

    // Filter messages with no text content
    if (filterNoText) {
      filtered = filtered
        .map((group) => {
          const filteredMessages = group.messages.filter(
            (msg: AcarsMsg) => msg.text || msg.data || msg.decoded_msg,
          );

          if (filteredMessages.length === 0) {
            return null;
          }

          return {
            ...group,
            messages: filteredMessages,
            has_alerts: filteredMessages.some((msg: AcarsMsg) => msg.matched),
            num_alerts: filteredMessages.filter((msg: AcarsMsg) => msg.matched)
              .length,
          } as MessageGroupType;
        })
        .filter((group): group is MessageGroupType => group !== null);
    }

    return filtered;
  }, [
    messageGroupsArray,
    textFilter,
    excludedLabels,
    filterNoText,
    showAlertsOnly,
    selectedStationIds,
  ]);

  // Calculate statistics (always use live message groups for statistics, even when paused)
  const statistics = useMemo(() => {
    let totalMessages = 0;
    let alertMessages = 0;
    let filteredCount = 0;

    // Count all messages in store (live count from all message groups)
    messageGroups.forEach((group) => {
      totalMessages += group.messages.length;
      alertMessages += group.num_alerts;
    });

    // Count filtered messages (from displayed message groups)
    filteredMessageGroups.forEach((group) => {
      filteredCount += group.messages.length;
    });

    const hiddenCount = totalMessages - filteredCount;

    return {
      totalAircraft: messageGroups.size, // Total message groups in memory
      displayedAircraft: filteredMessageGroups.length, // Message groups shown after filters
      totalMessages,
      displayedMessages: filteredCount,
      hiddenMessages: hiddenCount,
      alertMessages,
    };
  }, [messageGroups, filteredMessageGroups]);

  // Update statistics counters
  useEffect(() => {
    setTotalReceived(statistics.totalMessages);
  }, [statistics]);

  // ---------------------------------------------------------------------------
  // Virtualizer
  // ---------------------------------------------------------------------------

  /**
   * Estimated item height used for items not yet measured.
   *
   * WHY 300px: our cards range roughly 100px (minimal) to 600px+ (libacars).
   * Biasing high rather than low means new unmeasured items cause scrollTop to
   * overshoot slightly downward (user barely perceives this) rather than jump
   * upward toward new content (which feels like a snap back to the top).
   */
  const ESTIMATED_ITEM_HEIGHT = 300;

  const rowVirtualizer = useVirtualizer({
    count: filteredMessageGroups.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => ESTIMATED_ITEM_HEIGHT,
    overscan: 3,
    // Breathing room between the sticky filter bar and the first card when
    // scrolled to the top. This is virtual space — it belongs to the
    // scrollable content, so it naturally scrolls away as the user moves
    // down. Once scrolled past 24 px the first card sits flush at the top
    // of the container with no wasted space. 24 px = $spacing-lg, matching
    // the gap between cards (.message-list__item padding-bottom).
    paddingStart: 24,
  });

  // ---------------------------------------------------------------------------
  // Scroll anchoring — keep the user's viewport stable when new items are
  // prepended at index 0 (newest-first sort means all new messages land there).
  //
  // Algorithm:
  //   1. Before each render we hold prevTotalSize and prevFirstKey.
  //   2. After the render, if the first item's key changed (a prepend happened)
  //      AND the user has scrolled down (scrollTop > 0), we adjust scrollTop
  //      by the delta between the new and old total virtual height.
  //   3. useLayoutEffect runs synchronously after DOM mutations but before the
  //      browser paints, so the correction is invisible to the user.
  //
  // Known imprecision: unmeasured new items use estimateSize. Once the
  // virtualizer measures them the total size corrects again. We bias
  // ESTIMATED_ITEM_HEIGHT high so that correction moves the view slightly
  // downward rather than upward (downward drift is far less noticeable).
  // ---------------------------------------------------------------------------
  useLayoutEffect(() => {
    const currentFirstKey =
      filteredMessageGroups[0]?.messages[0]?.uid ??
      filteredMessageGroups[0]?.identifiers[0] ??
      null;

    const newTotalSize = rowVirtualizer.getTotalSize();
    const scrollEl = scrollContainerRef.current;

    if (
      scrollEl &&
      scrollEl.scrollTop > 0 &&
      prevFirstKey.current !== null &&
      prevFirstKey.current !== currentFirstKey &&
      newTotalSize > prevTotalSize.current
    ) {
      // Items were prepended. Shift scrollTop by the same amount the virtual
      // space grew so the user's viewport doesn't move.
      scrollEl.scrollTop += newTotalSize - prevTotalSize.current;
    }

    prevTotalSize.current = newTotalSize;
    prevFirstKey.current = currentFirstKey;
  });

  // Handler callbacks
  const handlePauseChange = useCallback(
    (paused: boolean) => {
      if (paused && !isPaused) {
        // About to pause - capture current message group state
        setFrozenMessageGroups(new Map(messageGroups));
      }
      setIsPaused(paused);
    },
    [isPaused, messageGroups],
  );

  const handleFilterNoTextChange = useCallback((enabled: boolean) => {
    setFilterNoText(enabled);
  }, []);

  const handleExcludedLabelsChange = useCallback((labels: string[]) => {
    setExcludedLabels(labels);
  }, []);

  const handleTextFilterChange = useCallback((text: string) => {
    setTextFilter(text);
  }, []);

  const handleShowAlertsOnlyChange = useCallback((enabled: boolean) => {
    setShowAlertsOnly(enabled);
  }, []);

  const handleSelectedStationIdsChange = useCallback((ids: string[]) => {
    setSelectedStationIds(ids);
  }, []);

  // Expose filter props globally for Navigation
  useEffect(() => {
    globalFilterProps = {
      labels,
      excludedLabels,
      onExcludedLabelsChange: handleExcludedLabelsChange,
      filterNoText,
      onFilterNoTextChange: handleFilterNoTextChange,
      isPaused,
      onPauseChange: handlePauseChange,
      textFilter,
      onTextFilterChange: handleTextFilterChange,
      showAlertsOnly,
      onShowAlertsOnlyChange: handleShowAlertsOnlyChange,
      stationIds,
      selectedStationIds,
      onSelectedStationIdsChange: handleSelectedStationIdsChange,
    };

    // Dispatch custom event to notify Navigation
    window.dispatchEvent(new CustomEvent("messageFiltersUpdate"));

    return () => {
      globalFilterProps = null;
    };
  }, [
    labels,
    excludedLabels,
    handleExcludedLabelsChange,
    filterNoText,
    handleFilterNoTextChange,
    isPaused,
    handlePauseChange,
    textFilter,
    handleTextFilterChange,
    showAlertsOnly,
    handleShowAlertsOnlyChange,
    stationIds,
    selectedStationIds,
    handleSelectedStationIdsChange,
  ]);

  return (
    <div className="page live-messages-page" ref={pageRef}>
      {/* Page Header */}
      <div className="page__header">
        <h1 className="page__title">Live Messages</h1>
        <div className="page__stats">
          <div className="stat">
            <span className="stat__label">Aircraft:</span>
            <span className="stat__value">
              {statistics.displayedAircraft}
              {statistics.totalAircraft !== statistics.displayedAircraft && (
                <span className="stat__secondary">
                  /{statistics.totalAircraft}
                </span>
              )}
            </span>
          </div>
          <div className="stat">
            <span className="stat__label">Messages:</span>
            <span className="stat__value">
              {statistics.displayedMessages}
              {statistics.hiddenMessages > 0 && (
                <span className="stat__secondary">
                  ({statistics.hiddenMessages} hidden)
                </span>
              )}
            </span>
          </div>
          {statistics.alertMessages > 0 && (
            <div className="stat stat--alert">
              <span className="stat__label">Alerts:</span>
              <span className="stat__value">{statistics.alertMessages}</span>
            </div>
          )}
        </div>
      </div>

      {/* Filters - mobile: in navbar flyout, desktop: inline */}
      <MessageFilters
        labels={labels}
        excludedLabels={excludedLabels}
        onExcludedLabelsChange={handleExcludedLabelsChange}
        filterNoText={filterNoText}
        onFilterNoTextChange={handleFilterNoTextChange}
        isPaused={isPaused}
        onPauseChange={handlePauseChange}
        textFilter={textFilter}
        onTextFilterChange={handleTextFilterChange}
        showAlertsOnly={showAlertsOnly}
        onShowAlertsOnlyChange={handleShowAlertsOnlyChange}
        stationIds={stationIds}
        selectedStationIds={selectedStationIds}
        onSelectedStationIdsChange={handleSelectedStationIdsChange}
      />

      {/* Message List */}
      <div className="page__content">
        {isPaused && (
          <div className="page__notice page__notice--warning">
            <span className="notice__icon">⏸</span>
            <span className="notice__text">
              Updates paused. Click "Resume" to continue receiving messages.
            </span>
          </div>
        )}

        {filteredMessageGroups.length === 0 ? (
          <div className="page__empty">
            {messageGroups.size === 0 ? (
              <>
                <h2>No Messages Yet</h2>
                <p>Waiting for ACARS messages from aircraft...</p>
                <p className="text-muted">
                  Messages will appear here as they are received and decoded.
                </p>
              </>
            ) : (
              <>
                <h2>No Messages Match Filters</h2>
                <p>
                  {totalReceived} message{totalReceived !== 1 ? "s" : ""}{" "}
                  received, but {statistics.hiddenMessages} hidden by current
                  filters.
                </p>
                <p className="text-muted">
                  Try adjusting your filter settings to see more messages.
                </p>
              </>
            )}
          </div>
        ) : (
          <div
            className="message-list"
            ref={scrollContainerRef}
            style={{ height: `${listHeight}px` }}
          >
            {/* Virtual container — its height equals the sum of all (estimated +
                measured) item heights. Items are absolutely positioned inside. */}
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                width: "100%",
                position: "relative",
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const group = filteredMessageGroups[virtualRow.index];
                const key =
                  group.messages[0]?.uid || group.identifiers.join("-");

                const savedIndex = activeTabIndices.current.get(key) ?? 0;
                // Clamp saved index in case messages were culled since last view
                const clampedIndex = Math.min(
                  savedIndex,
                  group.messages.length - 1,
                );

                return (
                  <div
                    key={key}
                    data-index={virtualRow.index}
                    ref={rowVirtualizer.measureElement}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <div className="message-list__item">
                      <MessageGroupComponent
                        plane={group}
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
          </div>
        )}
      </div>
    </div>
  );
};
