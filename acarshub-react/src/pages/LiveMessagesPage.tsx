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
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { MessageFilters } from "../components/MessageFilters";
import { MessageGroup as MessageGroupComponent } from "../components/MessageGroup";
import { useMessageFilters } from "../hooks/useMessageFilters";
import { useMessageListHeight } from "../hooks/useMessageListHeight";
import { useMessageScrollAnchor } from "../hooks/useMessageScrollAnchor";
import { usePageRegistration } from "../hooks/usePageRegistration";
import { useRegisterScrollContainer } from "../hooks/useRegisterScrollContainer";
import { useAppStore } from "../store/useAppStore";
import type { AcarsMsg, MessageGroup as MessageGroupType } from "../types";

export { getMessageFilterProps } from "../hooks/useMessageFilters";

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
 *
 * EFFECT-02: the page's original 9 useEffects (filter persistence, keyboard
 * shortcut, page registration, list-height measurement, scroll anchoring,
 * globalFilterProps exposure) have been extracted into domain hooks under
 * src/hooks/. This component now composes those hooks plus the pure
 * derivations (messageGroupsArray/filteredMessageGroups/statistics) that
 * combine their outputs with store state.
 */
export const LiveMessagesPage = () => {
  const messageGroups = useAppStore((state) => state.messageGroups);
  const labels = useAppStore((state) => state.labels);
  const stationIds = useAppStore((state) => state.stationIds);
  const setCurrentPage = useAppStore((state) => state.setCurrentPage);

  usePageRegistration("Live Messages", setCurrentPage);

  const {
    isPaused,
    filterNoText,
    excludedLabels,
    textFilter,
    showAlertsOnly,
    selectedStationIds,
    frozenMessageGroups,
    handlePauseChange,
    handleFilterNoTextChange,
    handleExcludedLabelsChange,
    handleTextFilterChange,
    handleShowAlertsOnlyChange,
    handleSelectedStationIdsChange,
  } = useMessageFilters({ messageGroups, labels, stationIds });

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

  const listHeight = useMessageListHeight(scrollContainerRef);

  /**
   * Per-group active tab index, keyed by group stable key (first message UID).
   *
   * WHY a ref instead of state: we don't want a tab click in one MessageGroup
   * to trigger a re-render of every other visible group. The ref is mutated
   * directly; the individual MessageGroup reads its own value on mount (when
   * the virtualizer re-mounts it after scrolling back into view).
   */
  const activeTabIndices = useRef<Map<string, number>>(new Map());

  // Register this page's scroll container with the global registry so the
  // scroll-to-top FAB and nav link handler target the correct element.
  useRegisterScrollContainer(scrollContainerRef);

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
              fieldMatches(
                typeof msg.libacars === "object" && msg.libacars !== null
                  ? JSON.stringify(msg.libacars)
                  : msg.libacars,
                "libacars",
              ) ||
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

  /**
   * Virtual padding above the first item (px). Matches $spacing-lg (24 px).
   * Used both as the virtualizer paddingStart and as the scroll-anchor
   * threshold — the user is considered "at the top" when scrollTop is inside
   * this padding zone, so new messages are allowed to flow in naturally.
   */
  const MESSAGE_LIST_PADDING_START = 24;

  const rowVirtualizer = useVirtualizer({
    count: filteredMessageGroups.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => ESTIMATED_ITEM_HEIGHT,
    overscan: 3,
    // Stable key per group so the height cache survives prepends. Without
    // this the cache is index-based: after a prepend every item shifts to a
    // higher index, the virtualizer reads the *old* item's cached height for
    // the *new* index, and items overlap or show the wrong amount of space.
    getItemKey: (index) => {
      const group = filteredMessageGroups[index];
      return group?.messages[0]?.uid ?? group?.identifiers.join("-") ?? index;
    },
    // Breathing room between the sticky filter bar and the first card when
    // scrolled to the top. This is virtual space — it belongs to the
    // scrollable content, so it naturally scrolls away as the user moves
    // down. Once scrolled past 24 px the first card sits flush at the top
    // of the container with no wasted space. 24 px = $spacing-lg, matching
    // the gap between cards (.message-list__item padding-bottom).
    paddingStart: MESSAGE_LIST_PADDING_START,
  });

  useMessageScrollAnchor({
    virtualizer: rowVirtualizer,
    scrollContainerRef,
    paddingStart: MESSAGE_LIST_PADDING_START,
  });

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
            style={
              {
                "--virtual-list-height": `${listHeight}px`,
              } as React.CSSProperties
            }
          >
            {/* Virtual container — its height equals the sum of all (estimated +
                measured) item heights. Items are absolutely positioned inside. */}
            <div
              className="virtual-list"
              style={
                {
                  "--virtual-list-total-height": `${rowVirtualizer.getTotalSize()}px`,
                } as React.CSSProperties
              }
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
                    className="virtual-list__row"
                    data-index={virtualRow.index}
                    ref={rowVirtualizer.measureElement}
                    style={
                      {
                        "--virtual-row-y": `${virtualRow.start}px`,
                      } as React.CSSProperties
                    }
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
