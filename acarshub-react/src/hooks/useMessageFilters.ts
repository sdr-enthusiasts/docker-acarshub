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
// EFFECT-02: extracted from pages/LiveMessagesPage.tsx.
//
// Owns every "message filter" concern: pause/resume (with a frozen message-
// group snapshot captured at the moment pausing begins), text/label/station/
// alerts-only filters (persisted to localStorage), the 'p'/'P' keyboard
// shortcut, and the globalFilterProps mechanism that lets Navigation.tsx
// render the same filter controls in its mobile flyout without prop-drilling
// through the entire page tree.
// ----------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import type { Labels, MessageGroup as MessageGroupType } from "../types";

// ---------------------------------------------------------------------------
// Global filter state for Navigation access
// ---------------------------------------------------------------------------

export interface MessageFilterProps {
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
}

let globalFilterProps: MessageFilterProps | null = null;

/** Read the live filter props from outside the component tree (Navigation.tsx's mobile flyout). */
export function getMessageFilterProps(): MessageFilterProps | null {
  return globalFilterProps;
}

export interface UseMessageFiltersOptions {
  messageGroups: Map<string, MessageGroupType>;
  labels: Labels;
  stationIds: string[];
}

export interface UseMessageFiltersResult {
  isPaused: boolean;
  filterNoText: boolean;
  excludedLabels: string[];
  textFilter: string;
  showAlertsOnly: boolean;
  selectedStationIds: string[];
  /** Message-group snapshot captured the moment pausing began. */
  frozenMessageGroups: Map<string, MessageGroupType>;
  handlePauseChange: (paused: boolean) => void;
  handleFilterNoTextChange: (enabled: boolean) => void;
  handleExcludedLabelsChange: (labels: string[]) => void;
  handleTextFilterChange: (text: string) => void;
  handleShowAlertsOnlyChange: (enabled: boolean) => void;
  handleSelectedStationIdsChange: (ids: string[]) => void;
}

export function useMessageFilters({
  messageGroups,
  labels,
  stationIds,
}: UseMessageFiltersOptions): UseMessageFiltersResult {
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

  const handleExcludedLabelsChange = useCallback((newLabels: string[]) => {
    setExcludedLabels(newLabels);
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

  return {
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
  };
}
