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
// Scroll-driven auto-collapse/expand for the search form: collapses to just
// its header row once the user scrolls it completely off the top of the
// viewport, and auto-expands when they scroll back to the very top.
//
// WHY dynamic threshold: a fixed pixel value (e.g. 80 px) breaks on mobile
// where the expanded form is taller than the viewport — the user must scroll
// more than 80 px just to reach the Search button, which would immediately
// collapse the form under them. Instead the hook collapses only once the
// form has fully scrolled above the visible area of .app-content, detected
// via getBoundingClientRect() comparisons (works in real browsers) with a
// scrollTop > 0 guard so jsdom's all-zero rects don't trigger falsely at
// mount time.
// ----------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from "react";

export interface UseSearchFormCollapseOptions {
  formRef: React.RefObject<HTMLFormElement | null>;
  /** Shared with other search-page hooks that also need the outer scroll
   * container (e.g. the scroll-margin measurement for the results virtualizer). */
  appContentRef: React.RefObject<HTMLElement | null>;
}

export interface UseSearchFormCollapseResult {
  isFormCollapsed: boolean;
  /**
   * Expand the form and scroll back to the top of the page so the form
   * fields are immediately reachable.
   *
   * WHY instant scroll: behavior:"smooth" creates a race on Mobile Safari —
   * the animation runs concurrently with Playwright's click action and can
   * move the target button outside the viewport mid-click.
   */
  expandForm: () => void;
}

export function useSearchFormCollapse({
  formRef,
  appContentRef,
}: UseSearchFormCollapseOptions): UseSearchFormCollapseResult {
  // Controls whether the search form is collapsed to just its header row.
  const [isFormCollapsed, setIsFormCollapsed] = useState(false);

  /**
   * When true the scroll-based auto-collapse/expand handler is suppressed.
   * Set by expandForm() so the programmatic scroll-to-top that follows the
   * expansion does not immediately re-collapse the form.
   * Cleared after 1 s — long enough for any real or synthetic scroll to settle.
   */
  const suppressAutoCollapse = useRef(false);
  const suppressAutoCollapseTimer = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  // Acquire the outer scroll container once on mount and wire up the
  // scroll-driven collapse/expand listener.
  useEffect(() => {
    const scrollEl = document.querySelector<HTMLElement>(".app-content");
    appContentRef.current = scrollEl;

    if (!scrollEl) return;

    const handleScroll = () => {
      if (suppressAutoCollapse.current) return;

      const scrollTop = scrollEl.scrollTop;

      // Auto-expand: when the user scrolls back to the very top, restore the
      // form so the fields are immediately accessible without clicking the
      // expand button.
      if (scrollTop <= 0) {
        setIsFormCollapsed(false);
        return;
      }

      // Auto-collapse: the form has scrolled completely above the visible
      // area of .app-content.
      //
      // In real browsers getBoundingClientRect() gives us live viewport
      // coordinates.  formRect.bottom ≤ containerRect.top means the bottom
      // edge of the form is at or above the top edge of the scroll container,
      // i.e. the form is entirely off-screen.
      //
      // In jsdom all rects are zero, so (0 - 0) = 0 ≤ 0 is trivially true.
      // The scrollTop > 0 guard above ensures we only reach this branch when
      // a test has explicitly simulated a scroll, which is the intended signal.
      const formRect = formRef.current?.getBoundingClientRect();
      const containerRect = scrollEl.getBoundingClientRect();
      if (formRect && formRect.bottom - containerRect.top <= 0) {
        setIsFormCollapsed(true);
      }
    };

    scrollEl.addEventListener("scroll", handleScroll, { passive: true });
    return () => scrollEl.removeEventListener("scroll", handleScroll);
  }, [formRef, appContentRef]);

  const expandForm = useCallback(() => {
    // Suppress auto-collapse so the programmatic scroll-to-top that follows
    // this expansion does not immediately re-collapse the form via the scroll
    // listener.  Cleared after 1 s — long enough for any real or synthetic
    // scroll triggered by the expansion to settle.
    if (suppressAutoCollapseTimer.current) {
      clearTimeout(suppressAutoCollapseTimer.current);
    }
    suppressAutoCollapse.current = true;
    suppressAutoCollapseTimer.current = setTimeout(() => {
      suppressAutoCollapse.current = false;
    }, 1000);

    setIsFormCollapsed(false);
    const scrollEl =
      appContentRef.current ??
      document.querySelector<HTMLElement>(".app-content");
    if (scrollEl) {
      scrollEl.scrollTo({ top: 0, behavior: "instant" });
    }
  }, [appContentRef]);

  return { isFormCollapsed, expandForm };
}
