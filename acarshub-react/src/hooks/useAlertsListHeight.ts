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
// Dynamically measures the height available for the virtual scroll
// container (same ResizeObserver rationale as
// hooks/useMessageListHeight.ts — a sibling hook extracted from
// LiveMessagesPage.tsx in EFFECT-02 — but kept as a separate hook rather
// than shared: the initial-height formula and the extra tabIndex-assignment
// step below differ slightly between the two pages).
//
// Also sets tabIndex=0 on the scroll container for keyboard scrollability
// (WCAG 2.1.1 / axe scrollable-region-focusable), assigned programmatically
// here rather than as a JSX attribute — Biome's noNoninteractiveTabindex
// lint cannot be suppressed via a JSX expression comment since the
// suppression target and the attribute node are different AST nodes.
// ----------------------------------------------------------------------------

import { useEffect, useState } from "react";

/** Floor applied to the measured height so the list never collapses to ~0px. */
const MIN_LIST_HEIGHT = 200;

export function useAlertsListHeight(
  scrollContainerRef: React.RefObject<HTMLElement | null>,
): number {
  /**
   * Height of the virtual scroll container in pixels, measured via
   * ResizeObserver so it exactly fills the remaining viewport below the
   * page header and controls bar without any hardcoded pixel values.
   */
  const [listHeight, setListHeight] = useState(() =>
    typeof window !== "undefined"
      ? Math.max(window.innerHeight - 200, 300)
      : 400,
  );

  useEffect(() => {
    const scrollEl = scrollContainerRef.current;
    if (!scrollEl) return;

    // Make the container keyboard-scrollable (WCAG 2.1.1 / axe
    // scrollable-region-focusable).
    scrollEl.tabIndex = 0;

    const measure = () => {
      const rect = scrollEl.getBoundingClientRect();
      const available = window.innerHeight - rect.top;
      setListHeight(Math.max(available, MIN_LIST_HEIGHT));
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(scrollEl);
    window.addEventListener("resize", measure);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [scrollContainerRef]);

  return listHeight;
}
