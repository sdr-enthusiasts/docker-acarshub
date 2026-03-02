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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMediaQuery } from "../useMediaQuery";

// ---------------------------------------------------------------------------
// matchMedia mock infrastructure
// ---------------------------------------------------------------------------

type ChangeListener = (event: MediaQueryListEvent) => void;

interface MockMediaQueryList {
  matches: boolean;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  /** Test helper: fire the change event with a new matches value */
  _fire: (matches: boolean) => void;
}

/**
 * Build a fresh mock matchMedia implementation.
 *
 * WHY a factory instead of a single shared mock:
 * Each test needs independent listener registries so that events fired in
 * one test don't bleed into another.
 */
function createMatchMediaMock(
  initialMatches: boolean,
): (query: string) => MockMediaQueryList {
  const listeners = new Set<ChangeListener>();

  const mql: MockMediaQueryList = {
    matches: initialMatches,
    addEventListener: vi.fn((_type: string, listener: ChangeListener) => {
      listeners.add(listener);
    }),
    removeEventListener: vi.fn((_type: string, listener: ChangeListener) => {
      listeners.delete(listener);
    }),
    _fire(newMatches: boolean) {
      mql.matches = newMatches;
      const event = { matches: newMatches } as MediaQueryListEvent;
      for (const listener of listeners) {
        listener(event);
      }
    },
  };

  return () => mql;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useMediaQuery", () => {
  let originalMatchMedia: typeof window.matchMedia;

  beforeEach(() => {
    originalMatchMedia = window.matchMedia;
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    vi.restoreAllMocks();
  });

  it("returns true when the query initially matches", () => {
    window.matchMedia = createMatchMediaMock(
      true,
    ) as unknown as typeof window.matchMedia;

    const { result } = renderHook(() => useMediaQuery("(max-width: 767px)"));

    expect(result.current).toBe(true);
  });

  it("returns false when the query does not initially match", () => {
    window.matchMedia = createMatchMediaMock(
      false,
    ) as unknown as typeof window.matchMedia;

    const { result } = renderHook(() => useMediaQuery("(max-width: 767px)"));

    expect(result.current).toBe(false);
  });

  it("updates to true when the query starts matching", () => {
    const mockMatchMedia = createMatchMediaMock(false);
    window.matchMedia = mockMatchMedia as unknown as typeof window.matchMedia;

    const { result } = renderHook(() => useMediaQuery("(max-width: 767px)"));

    expect(result.current).toBe(false);

    act(() => {
      // Retrieve the mql instance to fire the change event
      (mockMatchMedia("") as MockMediaQueryList)._fire(true);
    });

    expect(result.current).toBe(true);
  });

  it("updates to false when the query stops matching", () => {
    const mockMatchMedia = createMatchMediaMock(true);
    window.matchMedia = mockMatchMedia as unknown as typeof window.matchMedia;

    const { result } = renderHook(() => useMediaQuery("(max-width: 767px)"));

    expect(result.current).toBe(true);

    act(() => {
      (mockMatchMedia("") as MockMediaQueryList)._fire(false);
    });

    expect(result.current).toBe(false);
  });

  it("registers a change listener on mount", () => {
    const mockMatchMedia = createMatchMediaMock(false);
    window.matchMedia = mockMatchMedia as unknown as typeof window.matchMedia;

    renderHook(() => useMediaQuery("(max-width: 767px)"));

    const mql = mockMatchMedia("") as MockMediaQueryList;
    expect(mql.addEventListener).toHaveBeenCalledWith(
      "change",
      expect.any(Function),
    );
  });

  it("removes the change listener on unmount (no memory leaks)", () => {
    const mockMatchMedia = createMatchMediaMock(false);
    window.matchMedia = mockMatchMedia as unknown as typeof window.matchMedia;

    const { unmount } = renderHook(() => useMediaQuery("(max-width: 767px)"));

    const mql = mockMatchMedia("") as MockMediaQueryList;
    expect(mql.removeEventListener).not.toHaveBeenCalled();

    unmount();

    expect(mql.removeEventListener).toHaveBeenCalledWith(
      "change",
      expect.any(Function),
    );
  });

  it("regression: does not update state after unmount", () => {
    // Guard against the classic async state-update-after-unmount warning.
    // The cleanup in useEffect must remove the listener so that a change
    // event fired post-unmount never calls setMatches.
    const mockMatchMedia = createMatchMediaMock(false);
    window.matchMedia = mockMatchMedia as unknown as typeof window.matchMedia;

    const { result, unmount } = renderHook(() =>
      useMediaQuery("(max-width: 767px)"),
    );

    unmount();

    // Firing after unmount should not throw or update state.
    expect(() => {
      act(() => {
        (mockMatchMedia("") as MockMediaQueryList)._fire(true);
      });
    }).not.toThrow();

    // Value remains the last pre-unmount value (false).
    expect(result.current).toBe(false);
  });

  it("re-subscribes when the query string changes", () => {
    const mockMatchMedia = createMatchMediaMock(false);
    window.matchMedia = mockMatchMedia as unknown as typeof window.matchMedia;

    const { rerender } = renderHook(
      ({ query }: { query: string }) => useMediaQuery(query),
      { initialProps: { query: "(max-width: 767px)" } },
    );

    const mql = mockMatchMedia("") as MockMediaQueryList;
    const firstAddCallCount = (mql.addEventListener as ReturnType<typeof vi.fn>)
      .mock.calls.length;

    rerender({ query: "(min-width: 1024px)" });

    // A new subscription must be registered for the updated query.
    expect(
      (mql.addEventListener as ReturnType<typeof vi.fn>).mock.calls.length,
    ).toBeGreaterThan(firstAddCallCount);
  });
});
