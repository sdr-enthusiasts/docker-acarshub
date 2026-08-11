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
import { useAlertActionPlacement } from "../useAlertActionPlacement";

// ---------------------------------------------------------------------------
// matchMedia harness
//
// jsdom's matchMedia stub (see test/setup.ts) always reports matches:false and
// ignores the query, so it cannot express "short but wide". This harness
// evaluates the two queries the hook actually uses against a viewport the test
// controls, and supports live changes so the resize path is covered too.
// ---------------------------------------------------------------------------

interface Viewport {
  width: number;
  height: number;
}

type ChangeListener = (event: MediaQueryListEvent) => void;

let viewport: Viewport = { width: 1280, height: 900 };
const listeners = new Set<{ query: string; fn: ChangeListener }>();

/**
 * Evaluates the subset of media query syntax this hook uses. Deliberately
 * narrow: if the hook ever starts using a query shape this does not
 * understand, the throw makes that loud rather than silently returning false
 * and producing a green but meaningless test.
 */
function evaluate(query: string, vp: Viewport): boolean {
  const maxWidth = query.match(/^\(max-width:\s*(\d+)px\)$/);
  if (maxWidth) return vp.width <= Number(maxWidth[1]);

  const maxHeight = query.match(/^\(max-height:\s*(\d+)px\)$/);
  if (maxHeight) return vp.height <= Number(maxHeight[1]);

  throw new Error(`Unsupported media query in test harness: ${query}`);
}

function setViewport(next: Viewport): void {
  viewport = next;
  for (const l of listeners) {
    // Real matchMedia hands the listener a MediaQueryListEvent carrying the
    // new match state, and useMediaQuery reads event.matches from it. Passing
    // a bare call would leave the hook reading undefined.
    l.fn({
      matches: evaluate(l.query, viewport),
      media: l.query,
    } as MediaQueryListEvent);
  }
}

beforeEach(() => {
  viewport = { width: 1280, height: 900 };
  listeners.clear();

  vi.stubGlobal(
    "matchMedia",
    (query: string): MediaQueryList =>
      ({
        get matches() {
          return evaluate(query, viewport);
        },
        media: query,
        onchange: null,
        addEventListener: (_: string, fn: ChangeListener) => {
          listeners.add({ query, fn });
        },
        removeEventListener: (_: string, fn: ChangeListener) => {
          for (const l of listeners) {
            if (l.fn === fn) listeners.delete(l);
          }
        },
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const placementAt = (width: number, height: number): string => {
  viewport = { width, height };
  return renderHook(() => useAlertActionPlacement()).result.current;
};

describe("useAlertActionPlacement", () => {
  describe("header visible (viewport height > 800px)", () => {
    it.each([
      ["desktop", 1920, 1080],
      ["laptop", 1280, 900],
      ["tablet portrait", 768, 1024],
      // The header is hidden by a *height* query alone, so a narrow-but-tall
      // phone in portrait keeps the header — and therefore keeps the action
      // in it, rather than relocating to the nav bar.
      ["phone portrait", 390, 844],
      ["narrow phone portrait", 320, 900],
    ])("uses page-header on %s (%ix%i)", (_label, width, height) => {
      expect(placementAt(width, height)).toBe("page-header");
    });
  });

  describe("header hidden (viewport height <= 800px)", () => {
    it.each([
      ["desktop short", 1920, 720],
      ["laptop short", 1280, 720],
      ["tablet landscape", 1024, 768],
      ["md boundary", 768, 720],
    ])("uses controls-bar on %s (%ix%i)", (_label, width, height) => {
      expect(placementAt(width, height)).toBe("controls-bar");
    });

    it.each([
      ["just below md", 767, 720],
      ["phone landscape", 844, 390], // wide enough for controls-bar
    ])("resolves %s (%ix%i) by width", (_label, width, height) => {
      const expected = width <= 767 ? "nav-slot" : "controls-bar";
      expect(placementAt(width, height)).toBe(expected);
    });

    it.each([
      ["phone landscape narrow", 667, 375],
      ["phone portrait short", 390, 664],
      ["small phone", 320, 568],
    ])("uses nav-slot on %s (%ix%i)", (_label, width, height) => {
      expect(placementAt(width, height)).toBe("nav-slot");
    });
  });

  describe("boundary pixels", () => {
    // These four assertions are the whole point of deriving the thresholds
    // from a shared module: an off-by-one puts the action in a hidden
    // container at exactly one viewport size, which no coarse-grained test
    // would ever visit.
    it("keeps page-header at exactly 801px height", () => {
      expect(placementAt(1280, 801)).toBe("page-header");
    });

    it("switches away from page-header at exactly 800px height", () => {
      expect(placementAt(1280, 800)).toBe("controls-bar");
    });

    it("uses controls-bar at exactly 768px width when the header is hidden", () => {
      expect(placementAt(768, 800)).toBe("controls-bar");
    });

    it("uses nav-slot at exactly 767px width when the header is hidden", () => {
      expect(placementAt(767, 800)).toBe("nav-slot");
    });
  });

  describe("reacting to viewport changes", () => {
    it("moves the action as the viewport is resized across both axes", () => {
      viewport = { width: 1280, height: 900 };
      const { result } = renderHook(() => useAlertActionPlacement());
      expect(result.current).toBe("page-header");

      // Shrink height only: header goes away, width still roomy.
      act(() => setViewport({ width: 1280, height: 700 }));
      expect(result.current).toBe("controls-bar");

      // Shrink width too: no room on the mode row, fall back to the nav bar.
      act(() => setViewport({ width: 500, height: 700 }));
      expect(result.current).toBe("nav-slot");

      // Restore height: the header returns and reclaims the action even
      // though the viewport is still narrow.
      act(() => setViewport({ width: 500, height: 900 }));
      expect(result.current).toBe("page-header");
    });
  });
});
