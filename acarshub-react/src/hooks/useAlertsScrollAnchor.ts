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
// Scroll anchoring for live mode only. When the virtual size changes (new
// prepend or height remeasurement) AND the user has scrolled past the
// padding zone, adjusts scrollTop by the same delta so the currently-visible
// content does not appear to jump.
//
// Historical mode skips anchoring because results replace entirely on each
// page change — useAlertsScrollReset handles that reset instead. This is
// the key difference from hooks/useMessageScrollAnchor.ts (LiveMessagesPage,
// EFFECT-02): that page has only one mode, so it always anchors; this page
// must gate on `viewMode`.
// ----------------------------------------------------------------------------

import { useLayoutEffect, useRef } from "react";
import { isScrollingToTop } from "../utils/scrollRegistry";
import type { AlertsViewMode } from "./useAlertsHistoricalSearch";

/**
 * Minimal shape of a `@tanstack/react-virtual` Virtualizer this hook needs.
 */
export interface ScrollAnchorVirtualizer {
  getTotalSize: () => number;
}

export interface UseAlertsScrollAnchorOptions {
  viewMode: AlertsViewMode;
  liveVirtualizer: ScrollAnchorVirtualizer;
  scrollContainerRef: React.RefObject<HTMLElement | null>;
  /** Must match the live virtualizer's own `paddingStart` option. */
  paddingStart: number;
}

export function useAlertsScrollAnchor({
  viewMode,
  liveVirtualizer,
  scrollContainerRef,
  paddingStart,
}: UseAlertsScrollAnchorOptions): void {
  /** Total virtual size from the previous render, used by scroll anchoring. */
  const prevLiveTotalSize = useRef(0);

  useLayoutEffect(() => {
    if (viewMode !== "live") {
      prevLiveTotalSize.current = liveVirtualizer.getTotalSize();
      return;
    }

    const newTotalSize = liveVirtualizer.getTotalSize();
    const scrollEl = scrollContainerRef.current;

    // Skip the anchor while a scroll-to-top animation is in flight.
    // A direct scrollTop assignment would cancel the smooth scroll mid-flight,
    // leaving the user stuck partway down the page when a new message arrives
    // during the animation.
    if (scrollEl && scrollEl.scrollTop > paddingStart && !isScrollingToTop()) {
      const delta = newTotalSize - prevLiveTotalSize.current;
      if (delta !== 0) {
        scrollEl.scrollTop = Math.max(0, scrollEl.scrollTop + delta);
      }
    }

    prevLiveTotalSize.current = newTotalSize;
  });
}
