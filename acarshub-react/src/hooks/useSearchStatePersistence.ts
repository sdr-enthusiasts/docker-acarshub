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
// Persists search form/results state to sessionStorage so it survives
// in-app navigation (e.g. clicking a result, going to another page, and
// coming back) while still resetting on a genuine fresh page load (browser
// refresh/new tab). Distinguishes the two via a separate "navigation active"
// sessionStorage flag: present = in-app navigation (restore state), absent =
// fresh load (clear any stale state).
// ----------------------------------------------------------------------------

import { useEffect } from "react";
import type { AcarsMsg, CurrentSearch } from "../types";
import { uiLogger } from "../utils/logger";

const SEARCH_STATE_KEY = "acarshub_search_state";
const NAVIGATION_FLAG_KEY = "acarshub_navigation_active";

/** Persisted search state shape (sessionStorage-serialisable). */
export interface PersistedSearchState {
  searchParams: CurrentSearch;
  currentPage: number;
  results: AcarsMsg[];
  totalResults: number;
  queryTime: number | null;
  activeSearch: CurrentSearch | null;
}

/**
 * Synchronously load persisted search state (for use in useState's lazy
 * initializer — NOT an effect, since the component needs this value on its
 * very first render, before any effect has a chance to run).
 *
 * Returns {} on a fresh page load (also clearing any stale sessionStorage
 * state left over from a previous session).
 */
export function loadPersistedSearchState(): Partial<PersistedSearchState> {
  // Check if this is in-app navigation vs fresh page load
  const isInAppNavigation = sessionStorage.getItem(NAVIGATION_FLAG_KEY);

  if (!isInAppNavigation) {
    // Fresh page load - clear any old search state
    sessionStorage.removeItem(SEARCH_STATE_KEY);
    uiLogger.debug("Fresh page load detected - cleared search state");
    return {};
  }

  // In-app navigation - restore previous search state
  try {
    const stored = sessionStorage.getItem(SEARCH_STATE_KEY);
    if (stored) {
      uiLogger.debug("Restored search state from in-app navigation");
      return JSON.parse(stored);
    }
  } catch (error) {
    uiLogger.warn("Failed to load persisted search state", { error });
  }
  return {};
}

export function useSearchStatePersistence(state: PersistedSearchState): void {
  // Set navigation flag for subsequent page navigations
  useEffect(() => {
    sessionStorage.setItem(NAVIGATION_FLAG_KEY, "true");

    // Clear flag on page unload (browser close/refresh)
    const handleBeforeUnload = () => {
      sessionStorage.removeItem(NAVIGATION_FLAG_KEY);
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  // Persist state to sessionStorage whenever it changes. Deliberately listing
  // each field (not the `state` object itself) so the effect only re-runs
  // when a field's value/reference actually changes, not on every render —
  // a fresh object would be constructed by the caller on every render.
  // biome-ignore lint/correctness/useExhaustiveDependencies: depending on individual fields, not the `state` object reference (reconstructed fresh by the caller every render), so this effect only fires when a field's value actually changes.
  useEffect(() => {
    try {
      sessionStorage.setItem(SEARCH_STATE_KEY, JSON.stringify(state));
      uiLogger.debug("Persisted search state to sessionStorage");
    } catch (error) {
      uiLogger.warn("Failed to persist search state", { error });
    }
  }, [
    state.searchParams,
    state.currentPage,
    state.results,
    state.totalResults,
    state.queryTime,
    state.activeSearch,
  ]);
}
