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
// Owns the "pause live updates" feature: persisted-to-localStorage pause
// flag, the 'p'/'P' keyboard shortcut to toggle it, and the frozen aircraft
// snapshot captured at the moment pausing begins. `effectiveAircraft` is the
// pause-aware aircraft list every other map hook/consumer should render —
// live `pairedAircraft` while unpaused, the frozen snapshot while paused.
// ----------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from "react";
import type { PairedAircraft } from "../utils/aircraftPairing";
import { mapLogger } from "../utils/logger";

const PAUSE_STORAGE_KEY = "liveMap.isPaused";

export interface UseMapPauseStateOptions {
  /** Live (unfrozen) paired aircraft — snapshotted into `frozenAircraft`
   * the moment pausing begins. */
  pairedAircraft: PairedAircraft[];
}

export interface UseMapPauseStateResult {
  isPaused: boolean;
  /** Toggle pause (used by both the button and the 'p' keyboard shortcut). */
  handlePauseToggle: () => void;
  /** `frozenAircraft` while paused, live `pairedAircraft` while not. */
  effectiveAircraft: PairedAircraft[];
}

export function useMapPauseState({
  pairedAircraft,
}: UseMapPauseStateOptions): UseMapPauseStateResult {
  // Pause state (persisted to localStorage)
  const [isPaused, setIsPaused] = useState(() => {
    const saved = localStorage.getItem(PAUSE_STORAGE_KEY);
    return saved === "true";
  });

  // Frozen aircraft snapshot when paused
  const [frozenAircraft, setFrozenAircraft] = useState<PairedAircraft[]>([]);

  // Persist pause state to localStorage
  useEffect(() => {
    localStorage.setItem(PAUSE_STORAGE_KEY, String(isPaused));
  }, [isPaused]);

  // Capture aircraft snapshot when pausing (only when pause state changes).
  // Use a ref to always get the latest pairedAircraft at the moment of pausing.
  const pairedAircraftRef = useRef(pairedAircraft);
  pairedAircraftRef.current = pairedAircraft;

  useEffect(() => {
    if (isPaused) {
      // Capture snapshot at the moment of pausing
      setFrozenAircraft(pairedAircraftRef.current);
      mapLogger.info("Aircraft updates paused", {
        aircraftCount: pairedAircraftRef.current.length,
      });
    } else {
      mapLogger.info("Aircraft updates resumed");
    }
  }, [isPaused]);

  const handlePauseToggle = useCallback(() => {
    setIsPaused((prev) => !prev);
  }, []);

  // Keyboard shortcut: 'p' to toggle pause
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore if user is typing in an input field
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (event.key === "p" || event.key === "P") {
        event.preventDefault();
        setIsPaused((prev) => !prev);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const effectiveAircraft = isPaused ? frozenAircraft : pairedAircraft;

  return { isPaused, handlePauseToggle, effectiveAircraft };
}
