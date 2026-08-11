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

/**
 * Mobile navigation action-slot registry.
 *
 * The mobile nav bar exposes one slot, to the right of the msg/min widget,
 * into which the *active page* may project a single high-priority action. On
 * short-and-narrow viewports there is nowhere else for such an action to live:
 * `.page__header` is hidden below 800px viewport height, and the page's own
 * control rows are too cramped at phone widths to also carry it.
 *
 * WHY a module-level registry rather than React context:
 * `Navigation` is mounted as a sibling of the routed page tree, not an
 * ancestor of it, so a provider would have to be hoisted to `App` and threaded
 * down through every route. This mirrors `utils/scrollRegistry.ts`, which
 * solves the identical "chrome outside the page tree needs a handle on
 * something inside it" problem, and keeps the two consistent.
 *
 * WHY the page pushes into the nav rather than the nav pulling from the page:
 * the nav has no knowledge of any page's actions, and must not grow a
 * per-route switch statement. Ownership of the action — its label, its enabled
 * condition, its handler — stays entirely with the page that defines it.
 *
 * Only one slot exists, and therefore only one action may occupy it at a time.
 * That is deliberate: the slot is a scarce, high-value position, and silently
 * stacking actions into it would reintroduce the overflow problem it exists to
 * avoid. Because a route transition unmounts the previous page before the next
 * one projects into the slot, single occupancy needs no arbitration.
 */

type Subscriber = (slot: HTMLElement | null) => void;

/** The mounted slot element, or null when the mobile nav is not rendered. */
let currentSlot: HTMLElement | null = null;

/** Callbacks notified whenever the slot element is mounted or unmounted. */
const subscribers = new Set<Subscriber>();

/**
 * Registers (or, with `null`, deregisters) the nav action slot element.
 *
 * Called by `Navigation` from a ref callback, so it fires exactly when the
 * element attaches and detaches — including when the nav swaps between its
 * mobile and desktop layouts, which unmounts the slot entirely.
 *
 * Subscribers are notified synchronously so a page projecting into the slot
 * re-renders in the same commit phase and never paints a frame with its action
 * missing.
 */
export function registerNavActionSlot(slot: HTMLElement | null): void {
  currentSlot = slot;
  for (const cb of subscribers) {
    cb(currentSlot);
  }
}

/**
 * Returns the currently mounted nav action slot, or null when there is none.
 *
 * A null result is a normal state, not an error: the desktop nav has no slot
 * because pages have room for their own actions at that width.
 */
export function getNavActionSlot(): HTMLElement | null {
  return currentSlot;
}

/**
 * Subscribes to slot mount/unmount changes.
 *
 * The callback is NOT invoked on subscription — read the current value with
 * `getNavActionSlot()` for initial state, matching the convention established
 * by `subscribeToScrollContainer`.
 *
 * Returns an unsubscribe function; call it from an effect cleanup.
 */
export function subscribeToNavActionSlot(cb: Subscriber): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

/**
 * Clears all registry state.
 *
 * FOR TESTING ONLY — production code must let mount/unmount drive the slot.
 */
export function _resetNavActionSlotForTesting(): void {
  currentSlot = null;
  subscribers.clear();
}
