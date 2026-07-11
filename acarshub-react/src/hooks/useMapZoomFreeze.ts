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

// ----------------------------------------------------------------------------
// EFFECT-01: extracted from pages/LiveMapPage.tsx.
//
// Freezes the rendered aircraft list during active zoom gestures so markers
// don't visibly jump mid-zoom, then unfreezes ~200ms after zooming stops
// (cooldown). This is layered on top of (not a replacement for) pause
// freezing: `displayedAircraft` only updates from `effectiveAircraft`
// (pause-aware) when NOT zooming.
//
// NOTE (behaviour preserved verbatim from the pre-extraction code): when a
// zoom gesture starts, the immediate freeze in handleViewStateChange uses
// the RAW `pairedAircraft` (not the pause-aware `effectiveAircraft`). This
// looks asymmetric with the steady-state effect below (which freezes on
// `effectiveAircraft`), but changing it would be a behaviour change, not a
// refactor — left as-is.
// ----------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from "react";
import type { ViewState } from "react-map-gl/maplibre";
import type { PairedAircraft } from "../utils/aircraftPairing";
import { mapLogger } from "../utils/logger";

/** How long after zoom stops before aircraft positions unfreeze. */
const ZOOM_COOLDOWN_MS = 200;

/** Minimum zoom delta to be treated as "a zoom happened" vs. floating-point noise. */
const ZOOM_CHANGE_THRESHOLD = 0.01;

export interface UseMapZoomFreezeOptions {
  /** Raw (not pause-aware) paired aircraft — used to freeze the instant a
   * zoom gesture is detected. */
  pairedAircraft: PairedAircraft[];
  /** Pause-aware aircraft list — what `displayedAircraft` tracks once not zooming. */
  effectiveAircraft: PairedAircraft[];
}

export interface UseMapZoomFreezeResult {
  isZooming: boolean;
  /** The aircraft list to actually render — frozen during zoom gestures. */
  displayedAircraft: PairedAircraft[];
  /** Pass as MapComponent's onViewStateChange prop. */
  handleViewStateChange: (viewState: ViewState) => void;
}

export function useMapZoomFreeze({
  pairedAircraft,
  effectiveAircraft,
}: UseMapZoomFreezeOptions): UseMapZoomFreezeResult {
  const [isZooming, setIsZooming] = useState(false);
  const zoomCooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  // Freeze aircraft positions during zoom
  const frozenAircraftRef = useRef<PairedAircraft[]>(effectiveAircraft);
  const [displayedAircraft, setDisplayedAircraft] =
    useState<PairedAircraft[]>(effectiveAircraft);

  // Update displayed aircraft only when not zooming (and, transitively via
  // effectiveAircraft, not paused).
  useEffect(() => {
    if (!isZooming) {
      setDisplayedAircraft(effectiveAircraft);
      frozenAircraftRef.current = effectiveAircraft;
    }
  }, [effectiveAircraft, isZooming]);

  // Cleanup zoom cooldown timer on unmount
  useEffect(() => {
    return () => {
      if (zoomCooldownTimerRef.current) {
        clearTimeout(zoomCooldownTimerRef.current);
      }
    };
  }, []);

  // Handle zoom state tracking with cooldown
  const previousZoomRef = useRef<number | null>(null);

  const handleViewStateChange = useCallback(
    (viewState: ViewState) => {
      const currentZoom = viewState.zoom;

      // Initialize previous zoom on first call
      if (previousZoomRef.current === null) {
        previousZoomRef.current = currentZoom;
        return;
      }

      // Detect zoom change
      if (
        Math.abs(currentZoom - previousZoomRef.current) > ZOOM_CHANGE_THRESHOLD
      ) {
        // Zoom is happening
        if (!isZooming) {
          mapLogger.debug("Zoom detected, freezing aircraft positions");
          // Freeze current aircraft positions
          frozenAircraftRef.current = pairedAircraft;
          setDisplayedAircraft(frozenAircraftRef.current);
        }
        setIsZooming(true);

        // Clear any existing cooldown timer
        if (zoomCooldownTimerRef.current) {
          clearTimeout(zoomCooldownTimerRef.current);
        }

        // Set a new cooldown timer (200ms after zoom stops)
        zoomCooldownTimerRef.current = setTimeout(() => {
          setIsZooming(false);
          mapLogger.debug(
            "Zoom cooldown complete, unfreezing aircraft positions",
          );
          // Unfreeze - the effect above will update displayedAircraft with
          // the latest effectiveAircraft.
        }, ZOOM_COOLDOWN_MS);
      }

      previousZoomRef.current = currentZoom;
    },
    [isZooming, pairedAircraft],
  );

  return { isZooming, displayedAircraft, handleViewStateChange };
}
