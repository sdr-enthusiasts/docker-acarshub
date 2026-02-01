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

import { memo, useCallback, useEffect, useState } from "react";
import type { Labels } from "../types";
import { Button } from "./Button";
import { Modal } from "./Modal";
import { Toggle } from "./Toggle";

interface MessageFiltersProps {
  /** Available message labels from backend */
  labels: Labels;
  /** Currently excluded label IDs */
  excludedLabels: string[];
  /** Callback when excluded labels change */
  onExcludedLabelsChange: (labels: string[]) => void;
  /** Whether to filter out messages with no text */
  filterNoText: boolean;
  /** Callback when filter no-text toggle changes */
  onFilterNoTextChange: (enabled: boolean) => void;
  /** Whether message updates are paused */
  isPaused: boolean;
  /** Callback when pause state changes */
  onPauseChange: (paused: boolean) => void;
  /** Text search filter */
  textFilter: string;
  /** Callback when text filter changes */
  onTextFilterChange: (text: string) => void;
  /** Only show messages with alerts */
  showAlertsOnly: boolean;
  /** Callback when alerts-only filter changes */
  onShowAlertsOnlyChange: (enabled: boolean) => void;
}

/**
 * MessageFilters Component
 * Provides filtering and control options for the live messages view
 *
 * Features:
 * - Text search across message content
 * - Label filtering (exclude specific message types)
 * - Filter messages with no text content
 * - Show only messages with alerts
 * - Pause/resume live updates
 *
 * Design Notes:
 * - Label filter opens in modal for better mobile UX
 * - Compact toolbar layout with icons
 * - Mobile-first responsive design
 * - Keyboard shortcuts support (Space to pause)
 */
export const MessageFilters = memo(
  ({
    labels,
    excludedLabels,
    onExcludedLabelsChange,
    filterNoText,
    onFilterNoTextChange,
    isPaused,
    onPauseChange,
    textFilter,
    onTextFilterChange,
    showAlertsOnly,
    onShowAlertsOnlyChange,
  }: MessageFiltersProps) => {
    const [isLabelModalOpen, setIsLabelModalOpen] = useState(false);
    const [localTextFilter, setLocalTextFilter] = useState(textFilter);

    // Sync localTextFilter with textFilter prop (e.g., when cleared externally)
    useEffect(() => {
      setLocalTextFilter(textFilter);
    }, [textFilter]);

    // Handle label toggle
    const handleLabelToggle = useCallback(
      (labelId: string) => {
        if (excludedLabels.includes(labelId)) {
          onExcludedLabelsChange(excludedLabels.filter((id) => id !== labelId));
        } else {
          onExcludedLabelsChange([...excludedLabels, labelId]);
        }
      },
      [excludedLabels, onExcludedLabelsChange],
    );

    // Handle text filter submit (on Enter or blur)
    const handleTextFilterSubmit = useCallback(() => {
      onTextFilterChange(localTextFilter);
    }, [localTextFilter, onTextFilterChange]);

    const handleTextFilterKeyDown = useCallback(
      (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Enter") {
          handleTextFilterSubmit();
        }
      },
      [handleTextFilterSubmit],
    );

    // Get label entries sorted by ID
    const labelEntries = Object.entries(labels.labels || {}).sort((a, b) =>
      a[0].localeCompare(b[0]),
    );

    const excludedCount = excludedLabels.length;

    return (
      <div className="message-filters">
        <div className="message-filters__toolbar">
          {/* Text Search */}
          <div className="filter-group filter-group--search">
            <label htmlFor="text-search" className="filter-label">
              Search:
            </label>
            <input
              type="text"
              id="text-search"
              className="filter-input filter-input--search"
              placeholder="Search message text..."
              value={localTextFilter}
              onChange={(e) => setLocalTextFilter(e.target.value)}
              onBlur={handleTextFilterSubmit}
              onKeyDown={handleTextFilterKeyDown}
            />
            {localTextFilter && (
              <button
                type="button"
                className="filter-clear"
                onClick={() => {
                  setLocalTextFilter("");
                  onTextFilterChange("");
                }}
                aria-label="Clear search"
                title="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          {/* Toggle Filters */}
          <div className="filter-group filter-group--toggles">
            <Toggle
              id="filter-no-text"
              label="Hide no-text"
              checked={filterNoText}
              onChange={onFilterNoTextChange}
            />
            <Toggle
              id="show-alerts-only"
              label="Alerts only"
              checked={showAlertsOnly}
              onChange={onShowAlertsOnlyChange}
            />
          </div>

          {/* Action Buttons */}
          <div className="filter-group filter-group--actions">
            <Button
              variant={isPaused ? "warning" : "secondary"}
              size="sm"
              onClick={() => onPauseChange(!isPaused)}
              title={isPaused ? "Resume updates" : "Pause updates"}
            >
              {isPaused ? "▶ Resume" : "⏸ Pause"}
            </Button>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsLabelModalOpen(true)}
              title="Filter by message label"
            >
              Labels {excludedCount > 0 && `(${excludedCount} hidden)`}
            </Button>
          </div>
        </div>

        {/* Label Filter Modal */}
        <Modal
          isOpen={isLabelModalOpen}
          onClose={() => setIsLabelModalOpen(false)}
          title="Filter Message Labels"
          size="md"
        >
          <div className="label-filters">
            <p className="label-filters__description">
              Select message labels to hide from the live view. Hidden labels
              will not appear in the message list.
            </p>

            <div className="label-filters__list">
              {labelEntries.length === 0 ? (
                <p className="label-filters__empty">
                  No message labels available. Labels will appear once messages
                  are received.
                </p>
              ) : (
                labelEntries.map(([labelId, labelData]) => {
                  const isExcluded = excludedLabels.includes(labelId);
                  return (
                    <div key={labelId} className="label-filter-item">
                      <label
                        htmlFor={`label-${labelId}`}
                        className="label-filter-item__label"
                      >
                        <span className="label-filter-item__id">{labelId}</span>
                        <span className="label-filter-item__name">
                          {labelData.name}
                        </span>
                      </label>
                      <input
                        type="checkbox"
                        id={`label-${labelId}`}
                        className="label-filter-item__checkbox"
                        checked={isExcluded}
                        onChange={() => handleLabelToggle(labelId)}
                      />
                    </div>
                  );
                })
              )}
            </div>

            {excludedCount > 0 && (
              <div className="label-filters__actions">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onExcludedLabelsChange([])}
                >
                  Clear All ({excludedCount})
                </Button>
              </div>
            )}
          </div>
        </Modal>
      </div>
    );
  },
);

MessageFilters.displayName = "MessageFilters";
