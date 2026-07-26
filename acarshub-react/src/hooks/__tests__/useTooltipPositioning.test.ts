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
 * Tests for useTooltipPositioning (GOD-08).
 *
 * This hook was extracted from AircraftMarkers.tsx, where the same
 * onMouseEnter positioning calculation was duplicated three times across the
 * AnimatedSprite / static-sprite / SVG-fallback rendering branches.
 * AircraftMarkers.test.tsx explicitly defers "tooltip positioning math"
 * coverage to this dedicated suite.
 */

import { act, renderHook } from "@testing-library/react";
import type React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  calculateTooltipPosition,
  useTooltipPositioning,
} from "../useTooltipPositioning";

// ---------------------------------------------------------------------------
// calculateTooltipPosition (pure function)
// ---------------------------------------------------------------------------

describe("calculateTooltipPosition", () => {
  it("shows below when the marker is within 280px of the top", () => {
    const result = calculateTooltipPosition(
      { top: 100, left: 500, width: 32 },
      { left: 0, right: 1000 },
    );
    expect(result.showBelow).toBe(true);
  });

  it("shows above when the marker is 280px or more from the top", () => {
    const result = calculateTooltipPosition(
      { top: 280, left: 500, width: 32 },
      { left: 0, right: 1000 },
    );
    expect(result.showBelow).toBe(false);
  });

  it("centers the tooltip when it fits within the map bounds", () => {
    const result = calculateTooltipPosition(
      { top: 400, left: 500, width: 32 },
      { left: 0, right: 1000 },
    );
    expect(result.alignLeft).toBe(false);
    expect(result.alignRight).toBe(false);
  });

  it("aligns left when a centered tooltip would clip the right edge", () => {
    // Marker near the right edge of a narrow map: centering a 280px-wide
    // tooltip on it would push its right edge past mapBounds.right.
    const result = calculateTooltipPosition(
      { top: 400, left: 950, width: 32 },
      { left: 0, right: 1000 },
    );
    expect(result.alignRight).toBe(true);
    expect(result.alignLeft).toBe(false);
  });

  it("aligns right when a centered tooltip would clip the left edge", () => {
    // Marker near the left edge: centering would push the tooltip's left
    // edge before mapBounds.left.
    const result = calculateTooltipPosition(
      { top: 400, left: 10, width: 32 },
      { left: 0, right: 1000 },
    );
    expect(result.alignLeft).toBe(true);
    expect(result.alignRight).toBe(false);
  });

  it("never sets both alignLeft and alignRight simultaneously", () => {
    // Extremely narrow map bounds where a centered tooltip would clip both
    // edges at once — the mutual-exclusivity guard must suppress both flags
    // rather than aligning to both sides.
    const result = calculateTooltipPosition(
      { top: 400, left: 50, width: 32 },
      { left: 0, right: 100 },
    );
    expect(result.alignLeft && result.alignRight).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// useTooltipPositioning (hook)
// ---------------------------------------------------------------------------

function makeMouseEvent(
  rect: DOMRect,
  mapContainerRect: DOMRect | null,
): React.MouseEvent<HTMLElement> {
  const currentTarget = {
    getBoundingClientRect: () => rect,
    closest: (selector: string) =>
      selector === ".maplibregl-map" && mapContainerRect
        ? { getBoundingClientRect: () => mapContainerRect }
        : null,
  };
  return {
    currentTarget,
  } as unknown as React.MouseEvent<HTMLElement>;
}

function makeRect(overrides: Partial<DOMRect> = {}): DOMRect {
  return {
    top: 400,
    left: 500,
    right: 532,
    bottom: 432,
    width: 32,
    height: 32,
    x: 500,
    y: 400,
    toJSON: () => ({}),
    ...overrides,
  } as DOMRect;
}

describe("useTooltipPositioning", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls setTooltip with hex + computed position on mouse enter", () => {
    const setTooltip = vi.fn();
    const { result } = renderHook(() => useTooltipPositioning(setTooltip));

    const mapRect = makeRect({ left: 0, right: 1000 });
    const markerRect = makeRect({ top: 400, left: 500, width: 32 });
    const event = makeMouseEvent(markerRect, mapRect);

    act(() => {
      result.current.onMouseEnter("ABC123")(event);
    });

    expect(setTooltip).toHaveBeenCalledWith({
      hex: "ABC123",
      showBelow: false,
      alignLeft: false,
      alignRight: false,
    });
  });

  it("falls back to window bounds when no .maplibregl-map ancestor is found", () => {
    vi.stubGlobal("innerWidth", 1200);
    const setTooltip = vi.fn();
    const { result } = renderHook(() => useTooltipPositioning(setTooltip));

    // No map container -> mapBounds = { left: 0, right: window.innerWidth }.
    // Place the marker near the right edge of that fallback width so the
    // alignment branch is exercised even without a real map container.
    const markerRect = makeRect({ top: 400, left: 1150, width: 32 });
    const event = makeMouseEvent(markerRect, null);

    act(() => {
      result.current.onMouseEnter("DEF456")(event);
    });

    expect(setTooltip).toHaveBeenCalledWith(
      expect.objectContaining({ hex: "DEF456", alignRight: true }),
    );
  });

  it("produces independent handlers per hex from the same hook instance", () => {
    const setTooltip = vi.fn();
    const { result } = renderHook(() => useTooltipPositioning(setTooltip));

    const mapRect = makeRect({ left: 0, right: 1000 });
    const event = makeMouseEvent(makeRect(), mapRect);

    act(() => {
      result.current.onMouseEnter("AAA111")(event);
    });
    act(() => {
      result.current.onMouseEnter("BBB222")(event);
    });

    expect(setTooltip).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ hex: "AAA111" }),
    );
    expect(setTooltip).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ hex: "BBB222" }),
    );
  });

  it("calls setTooltip(null) on mouse leave", () => {
    const setTooltip = vi.fn();
    const { result } = renderHook(() => useTooltipPositioning(setTooltip));

    act(() => {
      result.current.onMouseLeave();
    });

    expect(setTooltip).toHaveBeenCalledWith(null);
  });
});
