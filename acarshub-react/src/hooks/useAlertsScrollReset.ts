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
// Scrolls the alerts list back to the top whenever the user switches
// view mode, changes the selected historical term, or navigates to a
// different historical page — each of these swaps the entire visible
// content, so a stale scroll position would leave the user looking at an
// arbitrary point in the new content.
//
// Takes the three trigger values as named parameters (rather than a
// generic rest/array parameter) because Biome's useExhaustiveDependencies
// lint requires the dependency array passed to useEffect to be a literal
// array — it cannot statically analyse a variable holding an array.
// ----------------------------------------------------------------------------

import { useEffect } from "react";
import type { AlertsViewMode } from "./useAlertsHistoricalSearch";

export function useAlertsScrollReset(
  scrollContainerRef: React.RefObject<HTMLElement | null>,
  viewMode: AlertsViewMode,
  selectedTerm: string,
  historicalPage: number,
): void {
  // biome-ignore lint/correctness/useExhaustiveDependencies: viewMode/selectedTerm/historicalPage are intentional trigger dependencies — the effect reads only the stable scrollContainerRef, but must re-fire whenever any of these change to reset the scroll position.
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [viewMode, selectedTerm, historicalPage]);
}
