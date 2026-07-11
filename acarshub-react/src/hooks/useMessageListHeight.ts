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
// Dynamically measures the height available for a virtual scroll container.
//
// WHY ResizeObserver instead of CSS calc():
// The nav bar, page header, and filter bar all consume vertical space above
// the message list. Their heights vary between mobile and desktop breakpoints
// and change when filters are shown/hidden. A ResizeObserver on the scroll
// container itself measures the actual available space after all the above
// elements have been laid out, without requiring any hardcoded pixel values.
// ----------------------------------------------------------------------------

import { useEffect, useState } from "react";

/** Floor applied to the measured height so the list never collapses to ~0px. */
const MIN_LIST_HEIGHT = 200;

export function useMessageListHeight(
  scrollContainerRef: React.RefObject<HTMLElement | null>,
): number {
  /**
   * Height of the virtual scroll container in pixels.
   *
   * Initial value: a reasonable fraction of the viewport so the first render
   * isn't completely empty while the effect hasn't run yet.
   */
  const [listHeight, setListHeight] = useState(() =>
    typeof window !== "undefined" ? Math.max(window.innerHeight, 300) : 400,
  );

  useEffect(() => {
    const scrollEl = scrollContainerRef.current;
    if (!scrollEl) return;

    const measure = () => {
      const rect = scrollEl.getBoundingClientRect();
      // Available height = distance from the top of the scroll container
      // to the bottom of the viewport. No buffer needed: overflow:hidden on
      // .app-content (set via CSS :has selector) silently clips any subpixel
      // overshoot so there is no risk of an outer scrollbar appearing.
      const available = window.innerHeight - rect.top;
      setListHeight(Math.max(available, MIN_LIST_HEIGHT));
    };

    measure();

    // Re-measure when the scroll container's size changes (e.g. filter bar
    // toggled, window resized, orientation change).
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
