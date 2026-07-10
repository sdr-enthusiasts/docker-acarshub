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

import type React from "react";
import { useCallback } from "react";

/**
 * Positioning result for a tooltip anchored to a hovered marker.
 */
export interface TooltipPosition {
  /** Render below the marker instead of above (marker is near the top edge). */
  showBelow: boolean;
  /** Left-align the tooltip instead of centering (would clip the right edge). */
  alignLeft: boolean;
  /** Right-align the tooltip instead of centering (would clip the left edge). */
  alignRight: boolean;
}

/**
 * Pure geometry calculation for tooltip placement, given the hovered
 * element's bounding rect and the bounds of its containing map viewport.
 *
 * Extracted as a standalone function (rather than inlined in the hook) so it
 * can be unit-tested with plain DOMRect-shaped objects, with no DOM/event
 * mocking required.
 *
 * @param rect - `getBoundingClientRect()` of the hovered marker element.
 * @param mapBounds - Bounds of the containing map viewport (left/right only
 *   are needed for horizontal clipping detection).
 */
export function calculateTooltipPosition(
  rect: Pick<DOMRect, "top" | "left" | "width">,
  mapBounds: Pick<DOMRect, "left" | "right">,
): TooltipPosition {
  // Show below if within 280px of top (accounts for full tooltip height).
  const showBelow = rect.top < 280;

  // Approximate tooltip width, used to predict clipping before the tooltip
  // itself has rendered (so there's nothing to measure yet).
  const tooltipWidth = 280;
  const halfTooltipWidth = tooltipWidth / 2;

  const markerCenterX = rect.left + rect.width / 2;
  const tooltipLeftEdgeIfCentered = markerCenterX - halfTooltipWidth;
  const tooltipRightEdgeIfCentered = markerCenterX + halfTooltipWidth;

  const wouldClipLeft = tooltipLeftEdgeIfCentered < mapBounds.left;
  const wouldClipRight = tooltipRightEdgeIfCentered > mapBounds.right;

  // Only align left/right if the tooltip would actually clip, otherwise
  // center. Mutually exclusive: can't be both left AND right aligned.
  const alignLeft = wouldClipLeft && !wouldClipRight;
  const alignRight = wouldClipRight && !wouldClipLeft;

  return { showBelow, alignLeft, alignRight };
}

/** Tooltip state for whichever marker (identified by `hex`) is currently hovered. */
export interface HoveredTooltipState extends TooltipPosition {
  hex: string;
}

/**
 * useTooltipPositioning
 *
 * Shared hover-tooltip positioning logic for map markers. Extracted from
 * AircraftMarkers.tsx (GOD-08), where the same ~30-line onMouseEnter
 * calculation was duplicated three times: once for the AnimatedSprite
 * branch, once for the static-sprite `<button>` branch, and once for the
 * SVG-fallback `<button>` branch.
 *
 * The hook is called once per component render (not per marker — calling it
 * inside a `.map()` would violate the rules of hooks). It returns a factory
 * function, `onMouseEnter(hex)`, which each marker's JSX calls with its own
 * hex to get a handler closed over that specific marker's identity — safe to
 * invoke per-iteration since it's a plain function call, not a hook call.
 *
 * @param setTooltip - State setter for the currently-hovered tooltip, shared
 *   across every marker (only one tooltip is visible at a time).
 */
export function useTooltipPositioning(
  setTooltip: (state: HoveredTooltipState | null) => void,
) {
  const onMouseEnter = useCallback(
    (hex: string) => (event: React.MouseEvent<HTMLElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();

      // Get the map container bounds (not window bounds — accounts for sidebar).
      const mapContainer = event.currentTarget.closest(".maplibregl-map");
      const mapBounds = mapContainer
        ? mapContainer.getBoundingClientRect()
        : { left: 0, right: window.innerWidth };

      const position = calculateTooltipPosition(rect, mapBounds);
      setTooltip({ hex, ...position });
    },
    [setTooltip],
  );

  const onMouseLeave = useCallback(() => {
    setTooltip(null);
  }, [setTooltip]);

  return { onMouseEnter, onMouseLeave };
}
