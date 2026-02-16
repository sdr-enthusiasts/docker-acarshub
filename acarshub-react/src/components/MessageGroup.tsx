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
import { Link } from "react-router-dom";
import { useAppStore } from "../store/useAppStore";
import type { Plane } from "../types";
import { uiLogger } from "../utils/logger";
import { MessageCard } from "./MessageCard";

interface MessageGroupProps {
  plane: Plane;
  showMarkReadButton?: boolean;
}

/**
 * MessageGroup Component
 * Displays a group of messages for a single aircraft
 *
 * Features:
 * - Tab navigation when multiple messages exist
 * - Previous/Next arrow navigation
 * - Shows current message position (e.g., "Message 2/5")
 * - Highlights aircraft with alerts in red
 * - Mobile-first swipeable tabs
 *
 * Design Notes:
 * - Uses controlled state for active tab
 * - Wraps MessageCard for individual message display
 * - Keyboard navigation support (left/right arrows)
 */
export const MessageGroup = ({
  plane,
  showMarkReadButton = false,
}: MessageGroupProps) => {
  const [activeMessageIndex, setActiveMessageIndex] = useState(0);
  const messageCount = plane.messages.length;
  const hasMultipleMessages = messageCount > 1;
  const activeMessage = plane.messages[activeMessageIndex];

  // Check if this aircraft is being tracked via ADS-B
  const adsbAircraft = useAppStore((state) => state.adsbAircraft);
  const isTrackedByAdsb = useMemo(() => {
    if (!adsbAircraft?.aircraft) return false;

    // Check if any of the plane's identifiers match ADS-B aircraft
    return adsbAircraft.aircraft.some((aircraft) => {
      const adsbHex = aircraft.hex.toUpperCase().trim();
      const adsbFlight = aircraft.flight?.trim().toUpperCase();
      const adsbTail = aircraft.r?.trim().toUpperCase();

      return plane.identifiers.some((identifier) => {
        const normalizedId = identifier.toUpperCase().trim();
        return (
          normalizedId === adsbHex ||
          (adsbFlight && normalizedId === adsbFlight) ||
          (adsbTail && normalizedId === adsbTail)
        );
      });
    });
  }, [adsbAircraft, plane.identifiers]);

  // Get the first identifier (preferably hex) for linking to map
  const getPrimaryIdentifier = useCallback((): string => {
    // Try to find a hex identifier (6 characters, all hex digits)
    const hexId = plane.identifiers.find(
      (id) => id.length === 6 && /^[0-9A-F]+$/i.test(id),
    );
    if (hexId) return hexId;

    // Otherwise use the first identifier
    return plane.identifiers[0] || "Unknown";
  }, [plane.identifiers]);

  // Reset active index if it exceeds message count (messages may have been culled)
  useEffect(() => {
    if (activeMessageIndex >= messageCount) {
      uiLogger.debug("Resetting active message index (out of bounds)", {
        activeIndex: activeMessageIndex,
        messageCount,
      });
      setActiveMessageIndex(0);
    }
  }, [activeMessageIndex, messageCount]);

  // Debug logging for tab clicks
  const handleTabClick = useCallback(
    (index: number) => {
      uiLogger.debug("Tab clicked", {
        clickedIndex: index,
        currentIndex: activeMessageIndex,
        messageCount,
        aircraftId: plane.identifiers[0],
      });
      setActiveMessageIndex(index);
    },
    [activeMessageIndex, messageCount, plane.identifiers],
  );

  // Navigation handlers
  const goToPrevious = useCallback(() => {
    setActiveMessageIndex((prev) => (prev === 0 ? messageCount - 1 : prev - 1));
  }, [messageCount]);

  const goToNext = useCallback(() => {
    setActiveMessageIndex((prev) => (prev === messageCount - 1 ? 0 : prev + 1));
  }, [messageCount]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goToPrevious();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        goToNext();
      }
    },
    [goToPrevious, goToNext],
  );

  // Get aircraft identifier for display
  const aircraftId = plane.identifiers.find((id) => id.length > 0) || "Unknown";

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: Interactive keyboard navigation for message tabs
    // biome-ignore lint/a11y/useAriaPropsSupportedByRole: aria-label is appropriate for group role with keyboard interaction
    <div
      className={`message-group ${plane.has_alerts ? "message-group--alert" : ""}`}
      role={hasMultipleMessages ? "group" : undefined}
      onKeyDown={hasMultipleMessages ? handleKeyDown : undefined}
      tabIndex={hasMultipleMessages ? 0 : -1}
      aria-label={
        hasMultipleMessages ? `Messages for ${aircraftId}` : undefined
      }
    >
      {/* Message Group Header */}
      <div className="message-group__header">
        <div className="message-group__aircraft">
          <span className="aircraft-id">{aircraftId}</span>
          {plane.has_alerts && (
            <span className="alert-count" title="Alert matches">
              {plane.num_alerts} alert{plane.num_alerts !== 1 ? "s" : ""}
            </span>
          )}
          {isTrackedByAdsb && (
            <Link
              to={`/adsb?aircraft=${encodeURIComponent(getPrimaryIdentifier())}`}
              className="adsb-tracking"
              title="Click to view on map"
            >
              ADS-B
            </Link>
          )}
        </div>
        {hasMultipleMessages && (
          <div className="message-group__counter">
            <span className="counter-text">
              Message {activeMessageIndex + 1}/{messageCount}
            </span>
          </div>
        )}
      </div>

      {/* Tab Navigation (only for multiple messages) */}
      {hasMultipleMessages && (
        <div className="message-group__tabs">
          <button
            type="button"
            className="tab-nav tab-nav--prev"
            onClick={goToPrevious}
            aria-label="Previous message"
            title="Previous message (Left arrow)"
          >
            ‹
          </button>

          <div className="tab-list" role="tablist">
            {plane.messages.map((msg, index) => (
              <button
                key={msg.uid || `msg-${index}`}
                type="button"
                role="tab"
                aria-selected={index === activeMessageIndex}
                aria-controls={`message-${msg.uid}`}
                className={`tab ${index === activeMessageIndex ? "tab--active" : ""} ${msg.matched ? "tab--alert" : ""}`}
                onClick={() => handleTabClick(index)}
                title={`Message ${index + 1}${msg.matched ? " (Alert)" : ""}`}
              >
                <span className="tab__number">{index + 1}</span>
                {msg.matched && (
                  <span className="tab__alert-indicator" title="Alert">
                    ⚠
                  </span>
                )}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="tab-nav tab-nav--next"
            onClick={goToNext}
            aria-label="Next message"
            title="Next message (Right arrow)"
          >
            ›
          </button>
        </div>
      )}

      {/* Active Message Content */}
      <div
        className="message-group__content"
        role="tabpanel"
        id={`message-${activeMessage.uid}`}
      >
        <MessageCard
          message={activeMessage}
          isAlert={activeMessage.matched}
          showDuplicates={activeMessage.duplicates}
          showMessageParts={activeMessage.msgno_parts}
          showMarkReadButton={showMarkReadButton}
        />
      </div>
    </div>
  );
};

MessageGroup.displayName = "MessageGroup";
