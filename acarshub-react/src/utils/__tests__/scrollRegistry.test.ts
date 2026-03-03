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

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  _resetScrollToTopForTesting,
  getScrollContainer,
  isScrollingToTop,
  registerScrollContainer,
  scrollToTop,
  subscribeToScrollContainer,
} from "../scrollRegistry";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeElement(scrollTop = 0): HTMLElement {
  const el = document.createElement("div");
  Object.defineProperty(el, "scrollTop", {
    get: () => scrollTop,
    set: vi.fn(),
    configurable: true,
  });
  el.scrollTo = vi.fn();
  return el;
}

// ---------------------------------------------------------------------------
// Reset registry state between tests.
// The registry uses module-level variables so we must deregister after each
// test to prevent state from leaking across test cases.
// ---------------------------------------------------------------------------

afterEach(() => {
  registerScrollContainer(null);
  // Reset scroll-to-top timer state so the _scrollingToTop flag and any
  // pending 600 ms fallback timer do not leak into subsequent tests.
  _resetScrollToTopForTesting();
});

// ---------------------------------------------------------------------------
// getScrollContainer
// ---------------------------------------------------------------------------

describe("getScrollContainer", () => {
  it("returns .app-content when no custom container is registered", () => {
    const appContent = document.createElement("div");
    appContent.className = "app-content";
    document.body.appendChild(appContent);

    expect(getScrollContainer()).toBe(appContent);

    document.body.removeChild(appContent);
  });

  it("returns null when no custom container is registered and .app-content is absent", () => {
    // Ensure no .app-content in DOM
    for (const el of document.querySelectorAll(".app-content")) {
      el.parentNode?.removeChild(el);
    }

    expect(getScrollContainer()).toBeNull();
  });

  it("returns the registered custom container when one has been set", () => {
    const custom = makeElement();
    registerScrollContainer(custom);

    expect(getScrollContainer()).toBe(custom);
  });

  it("falls back to .app-content after the custom container is deregistered", () => {
    const appContent = document.createElement("div");
    appContent.className = "app-content";
    document.body.appendChild(appContent);

    const custom = makeElement();
    registerScrollContainer(custom);
    expect(getScrollContainer()).toBe(custom);

    registerScrollContainer(null);
    expect(getScrollContainer()).toBe(appContent);

    document.body.removeChild(appContent);
  });
});

// ---------------------------------------------------------------------------
// registerScrollContainer
// ---------------------------------------------------------------------------

describe("registerScrollContainer", () => {
  it("updates the active container", () => {
    const el = makeElement();
    registerScrollContainer(el);
    expect(getScrollContainer()).toBe(el);
  });

  it("clears the active container when called with null", () => {
    const el = makeElement();
    registerScrollContainer(el);
    registerScrollContainer(null);
    // Falls back to default (null when no .app-content in DOM)
    const container = getScrollContainer();
    expect(container).not.toBe(el);
  });

  it("notifies all active subscribers synchronously", () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    const unsub1 = subscribeToScrollContainer(cb1);
    const unsub2 = subscribeToScrollContainer(cb2);

    const el = makeElement();
    registerScrollContainer(el);

    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb1).toHaveBeenCalledWith(el);
    expect(cb2).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledWith(el);

    unsub1();
    unsub2();
  });

  it("notifies subscribers with null when deregistering", () => {
    const cb = vi.fn();
    const unsub = subscribeToScrollContainer(cb);

    const el = makeElement();
    registerScrollContainer(el);
    cb.mockClear();

    registerScrollContainer(null);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(null);

    unsub();
  });
});

// ---------------------------------------------------------------------------
// subscribeToScrollContainer
// ---------------------------------------------------------------------------

describe("subscribeToScrollContainer", () => {
  it("returns an unsubscribe function", () => {
    const cb = vi.fn();
    const unsub = subscribeToScrollContainer(cb);
    expect(typeof unsub).toBe("function");
    unsub();
  });

  it("stops notifying the callback after unsubscribing", () => {
    const cb = vi.fn();
    const unsub = subscribeToScrollContainer(cb);
    unsub();

    registerScrollContainer(makeElement());
    expect(cb).not.toHaveBeenCalled();
  });

  it("does not call the callback immediately on subscription", () => {
    const cb = vi.fn();
    const unsub = subscribeToScrollContainer(cb);

    expect(cb).not.toHaveBeenCalled();

    unsub();
  });

  it("supports multiple independent subscribers", () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    const unsub1 = subscribeToScrollContainer(cb1);
    const unsub2 = subscribeToScrollContainer(cb2);

    const el = makeElement();
    registerScrollContainer(el);

    expect(cb1).toHaveBeenCalledWith(el);
    expect(cb2).toHaveBeenCalledWith(el);

    unsub1();
    cb1.mockClear();
    cb2.mockClear();

    // After unsub1, only cb2 should be notified
    registerScrollContainer(null);
    expect(cb1).not.toHaveBeenCalled();
    expect(cb2).toHaveBeenCalledWith(null);

    unsub2();
  });

  it("is safe to call unsubscribe multiple times", () => {
    const cb = vi.fn();
    const unsub = subscribeToScrollContainer(cb);
    unsub();
    expect(() => unsub()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// scrollToTop
// ---------------------------------------------------------------------------

describe("scrollToTop", () => {
  it("calls scrollTo({ top: 0, behavior: smooth }) on the registered container", () => {
    const el = makeElement();
    registerScrollContainer(el);

    scrollToTop();

    expect(el.scrollTo).toHaveBeenCalledTimes(1);
    expect(el.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
  });

  it("calls scrollTo on .app-content when no custom container is registered", () => {
    const appContent = document.createElement("div");
    appContent.className = "app-content";
    appContent.scrollTo = vi.fn();
    document.body.appendChild(appContent);

    scrollToTop();

    expect(appContent.scrollTo).toHaveBeenCalledTimes(1);
    expect(appContent.scrollTo).toHaveBeenCalledWith({
      top: 0,
      behavior: "smooth",
    });

    document.body.removeChild(appContent);
  });

  it("does not throw when no scroll container is available", () => {
    // Ensure nothing in the DOM
    for (const el of document.querySelectorAll(".app-content")) {
      el.parentNode?.removeChild(el);
    }

    expect(() => scrollToTop()).not.toThrow();
  });

  it("regression: uses the most recently registered container, not a stale one", () => {
    const el1 = makeElement();
    const el2 = makeElement();

    registerScrollContainer(el1);
    registerScrollContainer(el2);

    scrollToTop();

    expect(el1.scrollTo).not.toHaveBeenCalled();
    expect(el2.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
  });
});

// ---------------------------------------------------------------------------
// isScrollingToTop
// ---------------------------------------------------------------------------

describe("isScrollingToTop", () => {
  it("returns false before scrollToTop() is called", () => {
    expect(isScrollingToTop()).toBe(false);
  });

  it("returns true immediately after scrollToTop() is called", () => {
    const el = makeElement();
    registerScrollContainer(el);

    scrollToTop();

    expect(isScrollingToTop()).toBe(true);
  });

  it("returns false when no scroll container is available (scrollToTop is a no-op)", () => {
    // Ensure nothing in the DOM
    for (const el of document.querySelectorAll(".app-content")) {
      el.parentNode?.removeChild(el);
    }

    scrollToTop();

    expect(isScrollingToTop()).toBe(false);
  });

  it("returns false after the 600 ms guard timer fires", async () => {
    vi.useFakeTimers();

    const el = makeElement(200);
    // scrollTo on the element does NOT change scrollTop (mock doesn't update it),
    // so the fallback will attempt an instant scroll after the timeout.
    registerScrollContainer(el);

    scrollToTop();
    expect(isScrollingToTop()).toBe(true);

    await vi.advanceTimersByTimeAsync(600);

    expect(isScrollingToTop()).toBe(false);

    vi.useRealTimers();
  });

  it("snaps to top instantly after the guard timer if scrollTop is still > 0", async () => {
    vi.useFakeTimers();

    // scrollTop stays at 200 because the mock scrollTo does not update it.
    const el = makeElement(200);
    registerScrollContainer(el);

    scrollToTop();

    await vi.advanceTimersByTimeAsync(600);

    // Should have called scrollTo twice: once smooth, once instant fallback.
    expect(el.scrollTo).toHaveBeenCalledTimes(2);
    expect(el.scrollTo).toHaveBeenNthCalledWith(1, {
      top: 0,
      behavior: "smooth",
    });
    expect(el.scrollTo).toHaveBeenNthCalledWith(2, {
      top: 0,
      behavior: "instant",
    });

    vi.useRealTimers();
  });

  it("does not trigger fallback snap when scrollTop reaches 0 before the timer", async () => {
    vi.useFakeTimers();

    // Simulate a container that successfully scrolled to top.
    const el = makeElement(0);
    registerScrollContainer(el);

    scrollToTop();

    await vi.advanceTimersByTimeAsync(600);

    // Only the initial smooth call — no fallback instant call needed.
    expect(el.scrollTo).toHaveBeenCalledTimes(1);
    expect(el.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });

    vi.useRealTimers();
  });

  it("regression: repeated taps reset the guard timer, not stack it", async () => {
    vi.useFakeTimers();

    const el = makeElement(200);
    registerScrollContainer(el);

    scrollToTop();
    await vi.advanceTimersByTimeAsync(300); // half-way through guard
    scrollToTop(); // second tap resets the timer

    await vi.advanceTimersByTimeAsync(300); // 300 ms after second tap — flag still set
    expect(isScrollingToTop()).toBe(true);

    await vi.advanceTimersByTimeAsync(300); // 600 ms after second tap — flag clears
    expect(isScrollingToTop()).toBe(false);

    vi.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// Integration: route-change simulation
// ---------------------------------------------------------------------------

describe("route change simulation", () => {
  it("FAB subscriber re-attaches correctly when page registers a new container", () => {
    const received: Array<HTMLElement | null> = [];
    const unsub = subscribeToScrollContainer((container) => {
      received.push(container);
    });

    // Page A mounts
    const containerA = makeElement();
    registerScrollContainer(containerA);
    expect(received).toEqual([containerA]);

    // Page A unmounts
    registerScrollContainer(null);
    expect(received).toEqual([containerA, null]);

    // Page B mounts
    const containerB = makeElement();
    registerScrollContainer(containerB);
    expect(received).toEqual([containerA, null, containerB]);

    unsub();
  });

  it("scrollToTop targets the container registered by the current page", () => {
    const pageA = makeElement();
    const pageB = makeElement();

    // Navigate to page A
    registerScrollContainer(pageA);
    scrollToTop();
    expect(pageA.scrollTo).toHaveBeenCalledTimes(1);
    expect(pageB.scrollTo).not.toHaveBeenCalled();

    // Navigate to page B
    registerScrollContainer(null);
    registerScrollContainer(pageB);
    scrollToTop();
    expect(pageB.scrollTo).toHaveBeenCalledTimes(1);
    // Page A's scrollTo count should not increase
    expect(pageA.scrollTo).toHaveBeenCalledTimes(1);
  });
});
