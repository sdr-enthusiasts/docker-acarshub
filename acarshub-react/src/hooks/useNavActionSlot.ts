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

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  getNavActionSlot,
  subscribeToNavActionSlot,
} from "../utils/navActionSlot";

/**
 * useNavActionSlot
 *
 * Returns the mobile nav bar's action slot element, or null when no slot is
 * mounted (desktop nav, or before the nav's first commit).
 *
 * Pass the result to `createPortal` to project an action into the nav bar:
 *
 * ```tsx
 * const slot = useNavActionSlot();
 * return slot ? createPortal(<button …/>, slot) : null;
 * ```
 *
 * WHY useSyncExternalStore rather than useState + useEffect:
 * the slot appears and disappears as a *layout* consequence of a viewport
 * change — the same resize that flips `Navigation` between its mobile and
 * desktop trees. useSyncExternalStore subscribes during render and re-reads
 * the store in the commit phase, so a page portalling into the slot cannot
 * observe a tearing state where the nav has already swapped layouts but the
 * page still holds the old (now-detached) element. An effect-based
 * subscription would settle one commit later and could portal into a node
 * that is no longer in the document.
 */
export function useNavActionSlot(): HTMLElement | null {
  // getNavActionSlot is a stable module-level getter returning the same
  // element identity between changes, satisfying useSyncExternalStore's
  // requirement that getSnapshot be referentially stable across calls.
  const slot = useSyncExternalStore(
    subscribeToNavActionSlot,
    getNavActionSlot,
    // Server snapshot: no DOM, therefore no slot.
    () => null,
  );

  // -------------------------------------------------------------------------
  // Mount-order guard.
  //
  // `Navigation` and the routed page are siblings, and on a cold load with a
  // deep link straight to a page that uses the slot, React may commit the page
  // before the nav has attached its slot ref. The page's initial snapshot is
  // then null and — because no *store* change follows, the slot having been
  // registered before this component subscribed — no re-render is scheduled to
  // correct it.
  //
  // Forcing one post-mount re-read closes that window. It runs once per mount
  // and re-reads a module-level variable, so the cost is negligible; the
  // setState is skipped entirely when the snapshot was already correct, which
  // is the common case.
  // -------------------------------------------------------------------------
  const [, forceReread] = useState(0);
  useEffect(() => {
    if (getNavActionSlot() !== slot) {
      forceReread((n) => n + 1);
    }
  }, [slot]);

  return slot;
}
