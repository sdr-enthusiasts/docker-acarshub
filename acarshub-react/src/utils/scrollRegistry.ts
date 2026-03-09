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
 * Whether a scroll-to-top animation is currently in flight.
 *
 * The virtualizer pages (Live Messages, Alerts) use a useLayoutEffect scroll
 * anchor that directly assigns scrollTop to keep visible content stable when
 * new messages are prepended. That direct assignment cancels any in-progress
 * smooth-scroll animation. Pages guard their anchor with isScrollingToTop() so
 * the animation can complete without being interrupted.
 */
let _scrollingToTop = false;

/**
 * Timer ID for the 600 ms fallback that snaps to top if the smooth scroll
 * animation was cancelled before reaching scrollTop === 0.
 */
let _scrollTimer: ReturnType<typeof setTimeout> | null = null;

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
 * Returns true while a scroll-to-top animation is in flight.
 *
 * Pages with virtualizer scroll anchors should guard direct scrollTop
 * assignments with this flag to avoid cancelling the animation mid-flight.
 *
 * The flag is set by scrollToTop() and cleared either when the 600 ms fallback
 * timer fires or when _resetScrollToTopForTesting() is called (tests only).
 */
export function isScrollingToTop(): boolean {
  return _scrollingToTop;
}

/**
 * Scrolls the active scroll container to the top.
 *
 * Uses a smooth scroll for a polished UX. A 600 ms fallback timer monitors
 * whether the animation was interrupted (e.g. by the virtualizer's scroll
 * anchor direct-assignment guard failing during a burst of new messages) and
 * performs an instant snap-to-top if the container has not yet reached
 * scrollTop === 0 by that time.
 *
 * WHY smooth + fallback instead of instant:
 * Instant scroll works but provides no visual continuity. Smooth scroll gives
 * the user clear feedback that the page is returning to the top. The fallback
 * guarantees the user always reaches the top even if the animation is
 * cancelled, without permanently degrading the experience to a jump.
 *
 * WHY 600 ms:
 * Typical smooth-scroll durations in modern browsers are 200–400 ms. 600 ms
 * gives ample headroom for slower devices while being short enough that users
 * never perceive it as a delay.
 *
 * Used by both the mobile FAB and the desktop active-nav-link click handler.
 */
export function scrollToTop(): void {
  const el = getScrollContainer();
  if (!el) return;

  // Mark the animation as in-flight so virtualizer anchors can skip their
  // direct scrollTop assignments while we are animating.
  _scrollingToTop = true;

  // Reset any existing fallback timer so that rapid successive taps share a
  // single 600 ms guard window from the most recent tap.
  if (_scrollTimer !== null) {
    clearTimeout(_scrollTimer);
  }

  // Initiate the smooth scroll.
  el.scrollTo({ top: 0, behavior: "smooth" });

  // Fallback: after 600 ms, clear the in-flight flag and snap instantly if we
  // have not yet reached the top (the smooth animation was interrupted).
  _scrollTimer = setTimeout(() => {
    _scrollTimer = null;
    _scrollingToTop = false;
    if (el.scrollTop > 0) {
      el.scrollTo({ top: 0, behavior: "instant" });
    }
  }, 600);
}

/**
 * Resets all scroll-to-top state (flag + pending timer).
 *
 * FOR TESTING ONLY. Calling this in production code will leave the registry
 * in an inconsistent state if a scroll animation is in progress.
 */
export function _resetScrollToTopForTesting(): void {
  _scrollingToTop = false;
  if (_scrollTimer !== null) {
    clearTimeout(_scrollTimer);
    _scrollTimer = null;
  }
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
