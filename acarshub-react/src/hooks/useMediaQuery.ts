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

import { useEffect, useState } from "react";

/**
 * useMediaQuery
 *
 * Tracks whether a CSS media query currently matches.
 *
 * The hook subscribes to matchMedia change events so the returned value
 * stays in sync as the viewport is resized — no polling, no resize
 * listeners, and no redundant DOM trees hidden with display:none.
 *
 * WHY matchMedia instead of a resize listener:
 * - matchMedia fires exactly once at the breakpoint boundary rather than
 *   on every pixel of resize movement, keeping re-renders minimal.
 * - It mirrors the same query string used in CSS, making the JS breakpoint
 *   the single source of truth rather than duplicating pixel values.
 * - SSR-safe: the hook returns `false` when `window` is unavailable and
 *   corrects itself on first mount.
 *
 * @param query - A valid CSS media query string, e.g. "(max-width: 767px)"
 * @returns `true` when the query matches, `false` otherwise.
 *
 * @example
 * const isMobile = useMediaQuery("(max-width: 767px)");
 */
export function useMediaQuery(query: string): boolean {
  // Initialise from the current match state so the very first render is
  // already correct (avoids a flash of the wrong layout on mount).
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQueryList = window.matchMedia(query);

    // Sync state in case the query result changed between the lazy
    // initialiser and the effect running (e.g. during concurrent rendering).
    setMatches(mediaQueryList.matches);

    const listener = (event: MediaQueryListEvent): void => {
      setMatches(event.matches);
    };

    // addEventListener is supported in all modern browsers.
    // The older addListener API is deprecated and intentionally not used.
    mediaQueryList.addEventListener("change", listener);

    return () => {
      mediaQueryList.removeEventListener("change", listener);
    };
  }, [query]);

  return matches;
}
