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
// Scroll anchoring — keeps the user's viewport stable when the virtual list
// size changes (new items prepended, or existing items remeasured).
//
// Algorithm:
//   After every render, if the total virtual size changed AND the user has
//   scrolled past the padding zone (i.e., they are viewing real content, not
//   the top breathing-room gap), adjust scrollTop by the same delta so that
//   the content currently on screen doesn't appear to move.
//
// Why compensate for remeasurements as well as prepends:
//   A naive version only fires when the *first key* changes (a prepend). But
//   after a prepend the new item is initially estimated at a fixed height
//   (e.g. 300px). When it is later measured at its actual height (e.g.
//   150px), the total size shrinks. Without compensation the user drifts
//   downward per message — compounding with every new arrival. By reacting
//   to *any* size delta this corrects for both cases in one place.
//
// Why the threshold is `paddingStart` and not 0:
//   scrollTop > 0 but <= paddingStart means the user is still inside the
//   virtual breathing-room gap above the first card. Anchoring here would
//   jump them past the first message; they should instead see new messages
//   flow in naturally, just like when scrollTop = 0.
//
// useLayoutEffect runs synchronously after DOM mutations and before the
// browser paints, so corrections are invisible to the user.
// ----------------------------------------------------------------------------

import { useLayoutEffect, useRef } from "react";
import { isScrollingToTop } from "../utils/scrollRegistry";

/**
 * Minimal shape of a `@tanstack/react-virtual` Virtualizer this hook needs —
 * declared structurally rather than importing the library's own generic
 * Virtualizer type so callers can pass their virtualizer instance directly
 * regardless of its exact type parameters.
 */
export interface ScrollAnchorVirtualizer {
  getTotalSize: () => number;
}

export interface UseMessageScrollAnchorOptions {
  virtualizer: ScrollAnchorVirtualizer;
  scrollContainerRef: React.RefObject<HTMLElement | null>;
  /** Must match the virtualizer's own `paddingStart` option. */
  paddingStart: number;
}

export function useMessageScrollAnchor({
  virtualizer,
  scrollContainerRef,
  paddingStart,
}: UseMessageScrollAnchorOptions): void {
  /**
   * The total virtual height from the previous render, used to calculate how
   * much the virtual size changed and compensate scrollTop accordingly.
   */
  const prevTotalSize = useRef(0);

  useLayoutEffect(() => {
    const newTotalSize = virtualizer.getTotalSize();
    const scrollEl = scrollContainerRef.current;

    if (scrollEl && scrollEl.scrollTop > paddingStart && !isScrollingToTop()) {
      const delta = newTotalSize - prevTotalSize.current;
      if (delta !== 0) {
        scrollEl.scrollTop = Math.max(0, scrollEl.scrollTop + delta);
      }
    }

    prevTotalSize.current = newTotalSize;
  });
}
