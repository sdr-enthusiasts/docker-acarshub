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

import { type RefObject, useEffect } from "react";
import { registerScrollContainer } from "../utils/scrollRegistry";

/**
 * useRegisterScrollContainer
 *
 * Registers a custom scroll container element with the global scroll registry
 * on mount and deregisters it on unmount.
 *
 * Used by pages (Live Messages, Alerts) that own a dedicated scroll div instead
 * of relying on the default .app-content container. Pages that use .app-content
 * for scrolling (Search, Status) do not need this hook — the registry falls
 * back to .app-content automatically whenever no custom container is registered.
 *
 * WHY run only on mount/unmount:
 * The ref object is stable for the lifetime of the page component. The DOM
 * element it points to is created once and never replaced, so there is no need
 * to re-register on every render. The cleanup deregisters on unmount so that
 * the next page starts from a clean default state.
 *
 * @param ref - A React ref attached to the page's scroll container element.
 */
export function useRegisterScrollContainer(
  ref: RefObject<HTMLElement | null>,
): void {
  // biome-ignore lint/correctness/useExhaustiveDependencies: ref is a stable object; re-running on ref changes would cause spurious re-registrations
  useEffect(() => {
    registerScrollContainer(ref.current);
    return () => {
      registerScrollContainer(null);
    };
  }, []);
}
