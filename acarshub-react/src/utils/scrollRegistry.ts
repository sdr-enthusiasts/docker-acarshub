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
 * Scroll container registry.
 *
 * Pages that manage their own scroll container (Live Messages, Alerts) register
 * it here on mount so the FAB and nav scroll-to-top always target the correct
 * element regardless of route.
 *
 * Pages that scroll via the default .app-content element (Search, Status) do
 * not need to register anything — the registry falls back to .app-content
 * automatically when no custom container has been registered.
 *
 * WHY a module-level registry instead of React context:
 * The FAB is mounted outside the page component tree and needs to subscribe to
 * container changes triggered by page mount/unmount lifecycle. A module-level
 * pub/sub is simpler than threading a context provider through the app and
 * avoids the risk of stale closure captures in virtualizer effects.
 */

type Subscriber = (container: HTMLElement | null) => void;

/** Currently registered custom scroll container, or null for the default. */
let currentContainer: HTMLElement | null = null;

/** Set of callbacks notified whenever the registered container changes. */
const subscribers = new Set<Subscriber>();

/**
 * Returns the outer .app-content scroll container — the default fallback used
 * by pages that do not register a custom container.
 */
function getDefault(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.querySelector<HTMLElement>(".app-content");
}

/**
 * Registers a custom scroll container for the currently active page.
 *
 * Pass `null` to deregister (page unmount), which causes subsequent calls to
 * `getScrollContainer` to fall back to .app-content.
 *
 * All active subscribers are notified synchronously after the registry is
 * updated so the FAB re-attaches its scroll listener immediately.
 */
export function registerScrollContainer(container: HTMLElement | null): void {
  currentContainer = container;
  for (const cb of subscribers) {
    cb(currentContainer);
  }
}

/**
 * Returns the currently registered scroll container, falling back to
 * .app-content when no custom container has been registered.
 */
export function getScrollContainer(): HTMLElement | null {
  return currentContainer ?? getDefault();
}

/**
 * Smoothly scrolls the active scroll container to the top.
 *
 * Used by both the mobile FAB and the desktop active-nav-link click handler.
 */
export function scrollToTop(): void {
  const el = getScrollContainer();
  el?.scrollTo({ top: 0, behavior: "smooth" });
}

/**
 * Subscribes to scroll container changes.
 *
 * The callback is invoked whenever a page registers or deregisters its scroll
 * container (i.e. on every route transition). It is NOT called immediately on
 * subscription — callers should read the current value via `getScrollContainer`
 * for their initial setup.
 *
 * Returns an unsubscribe function; call it in a cleanup effect to prevent leaks.
 */
export function subscribeToScrollContainer(cb: Subscriber): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}
