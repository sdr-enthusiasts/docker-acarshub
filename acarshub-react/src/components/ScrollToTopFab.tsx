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

import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useMediaQuery } from "../hooks/useMediaQuery";
import {
  getScrollContainer,
  scrollToTop,
  subscribeToScrollContainer,
} from "../utils/scrollRegistry";
import { IconChevronUp } from "./icons";

/**
 * Scroll depth (px) before the FAB becomes visible.
 *
 * 150 px is deep enough that the user has clearly left the top of the page
 * but shallow enough that the button appears promptly on short lists.
 */
const SCROLL_THRESHOLD = 150;

/**
 * Routes where the FAB must never appear.
 * The Map page (/adsb) has no page-level scroll — the map itself pans.
 */
const EXCLUDED_ROUTES = new Set(["/adsb"]);

/**
 * ScrollToTopFab
 *
 * A floating action button rendered in the bottom-right corner of the viewport
 * that, when tapped, smoothly scrolls the active page back to the top.
 *
 * Behaviour:
 * - Mobile only (≤ 767 px). On desktop the active nav link re-click serves the
 *   same purpose without any additional UI chrome.
 * - Hidden until the user scrolls past SCROLL_THRESHOLD pixels.
 * - Excluded on the Map route which has no page-level scroll.
 * - Subscribes to the scroll registry so it automatically re-attaches its
 *   scroll listener when the active page registers a new scroll container on
 *   route change (Live Messages and Alerts use custom virtual-list containers;
 *   Search and Status use the outer .app-content element).
 * - Resets its visible state on every route change so it never flashes during
 *   the brief gap between navigation and the new page's scroll position reset.
 */
export function ScrollToTopFab(): ReactElement | null {
  const location = useLocation();
  const isMobile = useMediaQuery("(max-width: 767px)");
  const [isVisible, setIsVisible] = useState(false);

  // Attach a scroll listener to whichever element is currently the active
  // scroll container. Re-attaches automatically whenever the registry notifies
  // us of a container change (route transitions).
  useEffect(() => {
    let removeScrollListener: (() => void) | null = null;

    const attachToContainer = (container: HTMLElement | null): void => {
      // Remove the previous listener before switching containers so we never
      // accumulate stale listeners across route changes.
      removeScrollListener?.();
      removeScrollListener = null;

      const el = container ?? getScrollContainer();
      if (!el) {
        setIsVisible(false);
        return;
      }

      const handleScroll = (): void => {
        setIsVisible(el.scrollTop > SCROLL_THRESHOLD);
      };

      // Sync immediately with the container's current scroll position so the
      // FAB state is correct from the moment the container is registered.
      handleScroll();

      el.addEventListener("scroll", handleScroll, { passive: true });
      removeScrollListener = (): void =>
        el.removeEventListener("scroll", handleScroll);
    };

    // Bootstrap: attach to whatever container is active right now.
    // On first mount this is typically .app-content (no page has registered
    // a custom container yet); the subscription below corrects it once the
    // page's useEffect fires and registers its own container.
    attachToContainer(getScrollContainer());

    // Re-attach whenever a page registers or deregisters its scroll container.
    const unsubscribe = subscribeToScrollContainer(attachToContainer);

    return (): void => {
      removeScrollListener?.();
      unsubscribe();
    };
  }, []); // Intentionally runs once — the registry subscription handles all future changes.

  // Reset visibility on every route change so the FAB does not flash during
  // the brief window between navigation and the new container registering.
  // biome-ignore lint/correctness/useExhaustiveDependencies: location.pathname is the trigger, not a value used inside the body
  useEffect(() => {
    setIsVisible(false);
  }, [location.pathname]);

  // Only render on mobile and on scrollable routes.
  if (!isMobile || EXCLUDED_ROUTES.has(location.pathname)) {
    return null;
  }

  return (
    <button
      type="button"
      className={`scroll-to-top-fab${isVisible ? " scroll-to-top-fab--visible" : ""}`}
      onClick={scrollToTop}
      aria-label="Scroll to top"
      aria-hidden={!isVisible}
      tabIndex={isVisible ? 0 : -1}
      data-testid="scroll-to-top-fab"
    >
      <IconChevronUp />
    </button>
  );
}
