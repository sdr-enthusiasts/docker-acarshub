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
import {
  getScrollContainer,
  registerScrollContainer,
} from "../utils/scrollRegistry";

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
 * WHY two effects instead of one:
 *
 * Effect 1 (mount/unmount, deps=[]):
 *   Handles the normal React lifecycle — register when the page mounts, clear
 *   when it unmounts. This is the steady-state path in production.
 *
 * Effect 2 (no dep array, runs every render):
 *   Guards against Vite HMR module replacement during development. When the
 *   scrollRegistry module is hot-replaced its module-level `currentContainer`
 *   resets to null. React Fast Refresh re-renders all components that
 *   (transitively) import the changed module, but it does NOT remount them, so
 *   the mount-only Effect 1 never re-runs. Effect 2 detects the mismatch
 *   cheaply — `getScrollContainer() !== ref.current` — and re-registers only
 *   when necessary, firing zero subscriber notifications in the steady state.
 *
 * WHY the check is `getScrollContainer() !== ref.current` rather than just
 * always calling registerScrollContainer:
 *   registerScrollContainer notifies all subscribers synchronously (including
 *   the FAB scroll listener). Calling it on every render would cause the FAB
 *   to re-attach its scroll event listener after each message arrives (i.e.
 *   multiple times per second on busy feeds). The mismatch check makes Effect 2
 *   a no-op in the steady state: no subscriber notifications, no listener
 *   churn, and no visible side-effects in production builds.
 *
 * @param ref - A React ref attached to the page's scroll container element.
 */
export function useRegisterScrollContainer(
  ref: RefObject<HTMLElement | null>,
): void {
  // -------------------------------------------------------------------------
  // Effect 1: Lifecycle registration (mount → register, unmount → clear).
  // -------------------------------------------------------------------------
  // biome-ignore lint/correctness/useExhaustiveDependencies: ref is a stable object; re-running on ref changes would cause spurious re-registrations
  useEffect(() => {
    registerScrollContainer(ref.current);
    return () => {
      registerScrollContainer(null);
    };
  }, []);

  // -------------------------------------------------------------------------
  // Effect 2: HMR-resilience guard (runs after every render).
  //
  // In production this is effectively a no-op: the element is already
  // registered by Effect 1 so the check is always false.
  //
  // In development, after Vite hot-replaces scrollRegistry.ts, this effect
  // fires on the next React re-render (triggered by Fast Refresh) and detects
  // that the newly-initialised registry no longer knows about this container,
  // then re-registers it.
  //
  // No cleanup is needed: re-registration is idempotent and the mount/unmount
  // cleanup in Effect 1 is sufficient for the deregistration lifecycle.
  // -------------------------------------------------------------------------
  useEffect(() => {
    const el = ref.current;
    if (el !== null && getScrollContainer() !== el) {
      registerScrollContainer(el);
    }
  });
}
