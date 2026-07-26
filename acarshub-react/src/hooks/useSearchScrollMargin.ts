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
// Measures scrollMargin: the distance from the top of the outer scroll
// container's (.app-content) scroll origin to the top of the virtual
// results container. @tanstack/react-virtual uses this to determine which
// items are currently visible when the scroll container also contains
// content above the virtualized list (the search form, results-info bar,
// and pagination controls all sit above the results in this page).
//
// WHY useLayoutEffect: runs after DOM mutations and before paint, so the
// measurement uses the freshly-laid-out positions of all elements and the
// virtualizer has the correct offset on the very first paint cycle.
// ----------------------------------------------------------------------------

import { useLayoutEffect, useState } from "react";

export interface UseSearchScrollMarginOptions {
  virtualResultsRef: React.RefObject<HTMLDivElement | null>;
  /** Shared with useSearchFormCollapse — the outer .app-content scroll container. */
  appContentRef: React.RefObject<HTMLElement | null>;
  /**
   * Trigger re-measurement whenever this value changes (typically the
   * sorted results array) — the effect reads only stable refs, but must
   * re-fire whenever results change so scrollMargin is recalculated after
   * the DOM updates with new results-info/pagination elements above the
   * virtual container.
   */
  recomputeTrigger: unknown;
}

export function useSearchScrollMargin({
  virtualResultsRef,
  appContentRef,
  recomputeTrigger,
}: UseSearchScrollMarginOptions): number {
  const [scrollMargin, setScrollMargin] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: recomputeTrigger is an intentional trigger dependency — the effect reads refs (stable) but must re-fire whenever the caller's trigger value changes so the scrollMargin is recalculated after the DOM updates.
  useLayoutEffect(() => {
    const measure = () => {
      if (!virtualResultsRef.current) return;
      // Lazily acquire the scroll container in case the caller's own effect
      // that sets appContentRef has not fired yet (e.g. in strict-mode
      // double-invoke).
      if (!appContentRef.current) {
        appContentRef.current =
          document.querySelector<HTMLElement>(".app-content");
      }
      if (!appContentRef.current) return;

      const containerTop =
        virtualResultsRef.current.getBoundingClientRect().top;
      const scrollElTop = appContentRef.current.getBoundingClientRect().top;
      const margin =
        containerTop - scrollElTop + appContentRef.current.scrollTop;
      setScrollMargin(Math.max(0, margin));
    };

    measure();

    // Re-measure if the page content above the results changes size (e.g.
    // results-info bar appears, pagination bar appears/disappears on resize).
    const ro = new ResizeObserver(measure);
    const parent = virtualResultsRef.current?.parentElement;
    if (parent) ro.observe(parent);
    window.addEventListener("resize", measure);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [recomputeTrigger]);

  return scrollMargin;
}
