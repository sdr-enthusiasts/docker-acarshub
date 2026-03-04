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

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  _resetScrollToTopForTesting,
  getScrollContainer,
  registerScrollContainer,
  subscribeToScrollContainer,
} from "../../utils/scrollRegistry";
import { useRegisterScrollContainer } from "../useRegisterScrollContainer";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeElement(): HTMLElement {
  return document.createElement("div");
}

/** Creates a stable React RefObject wrapping the given element. */
function makeRef(el: HTMLElement | null): React.RefObject<HTMLElement | null> {
  return { current: el };
}

// ---------------------------------------------------------------------------
// Reset registry state between tests so module-level variables do not leak.
// ---------------------------------------------------------------------------

afterEach(() => {
  registerScrollContainer(null);
  _resetScrollToTopForTesting();
});

// ---------------------------------------------------------------------------
// Lifecycle: mount → register, unmount → deregister
// ---------------------------------------------------------------------------

describe("useRegisterScrollContainer — lifecycle", () => {
  it("registers the element on mount", () => {
    const el = makeElement();
    const ref = makeRef(el);

    renderHook(() => useRegisterScrollContainer(ref));

    expect(getScrollContainer()).toBe(el);
  });

  it("deregisters (sets null) on unmount", () => {
    const el = makeElement();
    const ref = makeRef(el);

    const { unmount } = renderHook(() => useRegisterScrollContainer(ref));
    expect(getScrollContainer()).toBe(el);

    unmount();

    // After unmount the registry no longer points at this element.
    expect(getScrollContainer()).not.toBe(el);
  });

  it("notifies subscribers when registered on mount", () => {
    const cb = vi.fn();
    const unsub = subscribeToScrollContainer(cb);

    const el = makeElement();
    const ref = makeRef(el);

    renderHook(() => useRegisterScrollContainer(ref));

    expect(cb).toHaveBeenCalledWith(el);

    unsub();
  });

  it("notifies subscribers with null when deregistered on unmount", () => {
    const el = makeElement();
    const ref = makeRef(el);

    const { unmount } = renderHook(() => useRegisterScrollContainer(ref));

    const cb = vi.fn();
    const unsub = subscribeToScrollContainer(cb);

    unmount();

    expect(cb).toHaveBeenCalledWith(null);

    unsub();
  });

  it("does not register when ref.current is null", () => {
    // Simulate a ref that has not yet been attached to a DOM element.
    const ref = makeRef(null);

    const appContent = document.createElement("div");
    appContent.className = "app-content";
    document.body.appendChild(appContent);

    renderHook(() => useRegisterScrollContainer(ref));

    // Should fall back to .app-content, not a custom container.
    expect(getScrollContainer()).toBe(appContent);

    document.body.removeChild(appContent);
  });
});

// ---------------------------------------------------------------------------
// HMR resilience: re-registration when registry is externally reset
// ---------------------------------------------------------------------------

describe("useRegisterScrollContainer — HMR resilience", () => {
  it("re-registers on re-render after the registry is externally cleared", () => {
    const el = makeElement();
    const ref = makeRef(el);

    const { rerender } = renderHook(() => useRegisterScrollContainer(ref));
    expect(getScrollContainer()).toBe(el);

    // Simulate an HMR replacement of scrollRegistry: the module-level
    // currentContainer is reset to null without unmounting the component.
    act(() => {
      registerScrollContainer(null);
    });

    // Registry is now cleared even though the component is still mounted.
    expect(getScrollContainer()).not.toBe(el);

    // A React re-render (triggered by Fast Refresh after HMR) should
    // re-register the container via Effect 2.
    rerender();

    expect(getScrollContainer()).toBe(el);
  });

  it("does not fire subscriber notifications on re-renders when already registered", () => {
    const el = makeElement();
    const ref = makeRef(el);

    const { rerender } = renderHook(() => useRegisterScrollContainer(ref));

    // Subscribe AFTER mount so we only track post-registration calls.
    const cb = vi.fn();
    const unsub = subscribeToScrollContainer(cb);

    // A normal re-render (no HMR reset) should NOT notify subscribers because
    // the registry is already correct — the mismatch guard should be false.
    rerender();
    rerender();

    expect(cb).not.toHaveBeenCalled();

    unsub();
  });

  it("re-registers exactly once per HMR reset, not on every subsequent re-render", () => {
    const el = makeElement();
    const ref = makeRef(el);

    const { rerender } = renderHook(() => useRegisterScrollContainer(ref));

    const cb = vi.fn();
    const unsub = subscribeToScrollContainer(cb);

    // Simulate one HMR reset.
    act(() => {
      registerScrollContainer(null);
    });
    cb.mockClear(); // ignore the null notification from the reset

    // First re-render after HMR: should re-register (one notification).
    rerender();
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(el);
    cb.mockClear();

    // Subsequent re-renders: already registered, should be silent.
    rerender();
    rerender();
    expect(cb).not.toHaveBeenCalled();

    unsub();
  });

  it("handles multiple HMR resets across the component lifetime", () => {
    const el = makeElement();
    const ref = makeRef(el);

    const { rerender } = renderHook(() => useRegisterScrollContainer(ref));

    for (let i = 0; i < 3; i++) {
      // Simulate HMR reset.
      act(() => {
        registerScrollContainer(null);
      });
      expect(getScrollContainer()).not.toBe(el);

      // Re-render restores registration.
      rerender();
      expect(getScrollContainer()).toBe(el);
    }
  });
});

// ---------------------------------------------------------------------------
// Integration: two pages competing for the registry slot
// ---------------------------------------------------------------------------

describe("useRegisterScrollContainer — multi-page integration", () => {
  it("the later-mounted page's container wins the registry slot", () => {
    const elA = makeElement();
    const elB = makeElement();
    const refA = makeRef(elA);
    const refB = makeRef(elB);

    renderHook(() => useRegisterScrollContainer(refA));
    expect(getScrollContainer()).toBe(elA);

    renderHook(() => useRegisterScrollContainer(refB));
    // Most recently mounted page takes the slot.
    expect(getScrollContainer()).toBe(elB);
  });

  it("unmounting the active page clears the registry to allow fallback", () => {
    const el = makeElement();
    const ref = makeRef(el);

    const appContent = document.createElement("div");
    appContent.className = "app-content";
    document.body.appendChild(appContent);

    const { unmount } = renderHook(() => useRegisterScrollContainer(ref));
    expect(getScrollContainer()).toBe(el);

    unmount();

    // Falls back to .app-content after the custom page unmounts.
    expect(getScrollContainer()).toBe(appContent);

    document.body.removeChild(appContent);
  });
});
