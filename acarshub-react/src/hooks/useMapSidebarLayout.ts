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
// EFFECT-01: extracted from pages/LiveMapPage.tsx.
//
// Owns the aircraft-list sidebar's width/collapse layout: drag-to-resize
// (mouse + keyboard), persistence to the settings store, the dynamic max
// width (which shrinks/grows with the set of active decoder types so the
// sidebar never gets wider than needed for its badges), and applying the
// resolved width as a `--map-sidebar-width` CSS custom property on the
// container ref (STYLE-INLINE-DYNAMIC pattern — computed at runtime, kept
// out of JSX `style=` by writing directly to the DOM style property during
// drag for performance, then committing to React state on mouseup).
// ----------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from "react";
import { mapLogger } from "../utils/logger";

// Minimum sidebar width – the lowest value the user can drag to.
// Horizontal scroll is prevented by the callsign column min-width (60 px) in
// SCSS rather than by enforcing a large minimum here.  Keeping this at 335 px
// preserves a wide, usable resize range.
export const SIDEBAR_MIN_WIDTH = 335;

// Default sidebar width used when no explicit user preference has been stored
// (or when the stored value equals the old default of px, meaning the user
// never deliberately set a width).  335 px places the sidebar in Phase 3 so
// that at least one decoder badge is visible as soon as the map loads.
const DEFAULT_SIDEBAR_WIDTH = 335;
const SIDEBAR_COLLAPSED_WIDTH = 40;

// Phase boundary where both Alerts and Messages columns reach their maximum
// widths (44→68 for alerts, 44→88 for messages). After this point, extra
// sidebar width flows into the callsign column for decoder badges.
// Must stay in sync with PHASE2_END in AircraftList.tsx.
const PHASE2_END = 388;

// Pixels of sidebar width required to display one decoder badge in the
// callsign column. Must stay in sync with AircraftList.tsx BADGE_WIDTH_PX.
const BADGE_WIDTH_PX = 20;

/**
 * Compute the maximum sidebar width for the given number of active decoder
 * types.  The cap is set just wide enough to show all active decoder badges
 * in the callsign column without wasted space.
 *
 * SIDEBAR_MIN_WIDTH is used as a floor so the max is never smaller than the
 * minimum, which would make the sidebar unusable when no decoders are active.
 *
 *   N = 0 → 388 px  (full column headers, no badge space)
 *   N = 1 → 408 px  (exactly fits 1 badge)
 *   N = 2 → 428 px  (room for 2 badges)
 *   N = 5 → 488 px  (room for 5 badges)
 */
export function computeMaxSidebarWidth(numActiveDecoders: number): number {
  return Math.max(
    SIDEBAR_MIN_WIDTH,
    PHASE2_END + numActiveDecoders * BADGE_WIDTH_PX,
  );
}

export interface UseMapSidebarLayoutOptions {
  storedSidebarWidth: number | undefined;
  storedSidebarCollapsed: boolean | undefined;
  setMapSidebarWidth: (width: number) => void;
  setMapSidebarCollapsed: (collapsed: boolean) => void;
  /** Number of distinct decoder types currently visible — drives the
   * dynamic max width. */
  numActiveDecoders: number;
}

export interface UseMapSidebarLayoutResult {
  containerRef: React.RefObject<HTMLDivElement | null>;
  sidebarWidth: number;
  sidebarMaxWidth: number;
  isResizing: boolean;
  isSidebarCollapsed: boolean;
  handleResizeMouseDown: (e: React.MouseEvent) => void;
  handleResizeKeyDown: (e: React.KeyboardEvent) => void;
  handleCollapseToggle: () => void;
}

export function useMapSidebarLayout({
  storedSidebarWidth,
  storedSidebarCollapsed,
  setMapSidebarWidth,
  setMapSidebarCollapsed,
  numActiveDecoders,
}: UseMapSidebarLayoutOptions): UseMapSidebarLayoutResult {
  // Sidebar resize state – local during drag, persisted to store on mouseup.
  // If the stored value is still at the old floor (325 px – the minimum that
  // predates decoder-badge sizing), treat it as "no preference set" and start
  // at DEFAULT_SIDEBAR_WIDTH so that at least one badge is visible on load.
  // Any explicitly wider value is preserved as-is.
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    if (!storedSidebarWidth || storedSidebarWidth <= SIDEBAR_MIN_WIDTH) {
      return DEFAULT_SIDEBAR_WIDTH;
    }
    return storedSidebarWidth;
  });
  const [isResizing, setIsResizing] = useState(false);

  // Sidebar collapse state – persisted to settings store
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(
    () => storedSidebarCollapsed ?? false,
  );

  // Container ref used to apply --map-sidebar-width CSS custom property
  const containerRef = useRef<HTMLDivElement>(null);
  // Drag tracking refs – no React state so mousemove never triggers re-renders
  const isDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartWidthRef = useRef(0);

  // Dynamic max width – updates whenever the set of active decoders changes.
  const sidebarMaxWidth = computeMaxSidebarWidth(numActiveDecoders);

  // Ref so that the stable mousemove/mouseup listeners always see the latest
  // dynamic max width without needing to be re-registered.
  const sidebarMaxWidthRef = useRef(sidebarMaxWidth);
  sidebarMaxWidthRef.current = sidebarMaxWidth;

  // Apply the CSS custom property whenever sidebarWidth or collapsed state
  // changes.  When collapsed the sidebar shrinks to the button-only strip.
  useEffect(() => {
    const effectiveWidth = isSidebarCollapsed
      ? SIDEBAR_COLLAPSED_WIDTH
      : sidebarWidth;
    containerRef.current?.style.setProperty(
      "--map-sidebar-width",
      `${effectiveWidth}px`,
    );
  }, [sidebarWidth, isSidebarCollapsed]);

  // Global mouse-move / mouse-up handlers for the resize drag gesture.
  // Registered once; isDraggingRef gates execution so they are cheap.
  // sidebarMaxWidthRef is used instead of a captured constant so the handlers
  // always enforce the current dynamic maximum without re-registration.
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const delta = e.clientX - dragStartXRef.current;
      const newWidth = Math.max(
        SIDEBAR_MIN_WIDTH,
        Math.min(sidebarMaxWidthRef.current, dragStartWidthRef.current + delta),
      );
      // Update the CSS variable directly – bypasses React for smooth dragging
      containerRef.current?.style.setProperty(
        "--map-sidebar-width",
        `${newWidth}px`,
      );
    };

    const handleMouseUp = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      setIsResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";

      // Read the final value from the CSS variable and commit to state + store
      const raw = containerRef.current?.style.getPropertyValue(
        "--map-sidebar-width",
      );
      const finalWidth = raw
        ? Math.max(
            SIDEBAR_MIN_WIDTH,
            Math.min(sidebarMaxWidthRef.current, parseInt(raw, 10)),
          )
        : SIDEBAR_MIN_WIDTH;

      setSidebarWidth(finalWidth);
      setMapSidebarWidth(finalWidth);
      mapLogger.debug("Sidebar resized", { width: finalWidth });
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [setMapSidebarWidth]);

  // Clamp the current sidebar width when the dynamic maximum shrinks (e.g.
  // when all aircraft with a particular decoder type leave the display).
  useEffect(() => {
    if (!isSidebarCollapsed && sidebarWidth > sidebarMaxWidth) {
      const clamped = sidebarMaxWidth;
      setSidebarWidth(clamped);
      setMapSidebarWidth(clamped);
      containerRef.current?.style.setProperty(
        "--map-sidebar-width",
        `${clamped}px`,
      );
    }
  }, [sidebarMaxWidth, sidebarWidth, setMapSidebarWidth, isSidebarCollapsed]);

  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDraggingRef.current = true;
      dragStartXRef.current = e.clientX;
      dragStartWidthRef.current = sidebarWidth;
      setIsResizing(true);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [sidebarWidth],
  );

  // Keyboard handler for the separator role – arrow keys adjust width by
  // 10 px per press (40 px with Shift) so keyboard-only users can resize.
  const handleResizeKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const step = e.shiftKey ? 40 : 10;
      let newWidth: number | null = null;

      if (e.key === "ArrowRight") {
        newWidth = Math.min(sidebarMaxWidthRef.current, sidebarWidth + step);
      } else if (e.key === "ArrowLeft") {
        newWidth = Math.max(SIDEBAR_MIN_WIDTH, sidebarWidth - step);
      } else if (e.key === "Home") {
        newWidth = SIDEBAR_MIN_WIDTH;
      } else if (e.key === "End") {
        newWidth = sidebarMaxWidthRef.current;
      }

      if (newWidth !== null) {
        e.preventDefault();
        containerRef.current?.style.setProperty(
          "--map-sidebar-width",
          `${newWidth}px`,
        );
        setSidebarWidth(newWidth);
        setMapSidebarWidth(newWidth);
      }
    },
    [sidebarWidth, setMapSidebarWidth],
  );

  // Toggle sidebar collapsed state and persist to settings store.
  const handleCollapseToggle = useCallback(() => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      setMapSidebarCollapsed(next);
      mapLogger.debug("Sidebar collapsed state changed", { collapsed: next });
      return next;
    });
  }, [setMapSidebarCollapsed]);

  return {
    containerRef,
    sidebarWidth,
    sidebarMaxWidth,
    isResizing,
    isSidebarCollapsed,
    handleResizeMouseDown,
    handleResizeKeyDown,
    handleCollapseToggle,
  };
}
