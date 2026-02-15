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

import { useCallback, useEffect, useMemo, useState } from "react";
import { MessageFilters } from "../components/MessageFilters";
import { MessageGroup as MessageGroupComponent } from "../components/MessageGroup";
import { socketService } from "../services/socket";
import { useAppStore } from "../store/useAppStore";
import type { AcarsMsg, MessageGroup as MessageGroupType } from "../types";

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

  // Statistics state
  const [totalReceived, setTotalReceived] = useState(0);

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

  // Notify page change
  useEffect(() => {
    setCurrentPage("Live Messages");
    socketService.notifyPageChange("Live Messages");
  }, [setCurrentPage]);

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

  return (
    <div className="page live-messages-page">
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

      {/* Filters */}
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
          <div className="message-list">
            {filteredMessageGroups.map((group) => {
              // Use first message UID as key for stability
              const key = group.messages[0]?.uid || group.identifiers.join("-");
              return <MessageGroupComponent key={key} plane={group} />;
            })}
          </div>
        )}
      </div>
    </div>
  );
};
