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
// Owns the map's own loaded/lifecycle bookkeeping: registering this page with
// the app store + socket service on mount, tracking whether the underlying
// MapLibre instance has fired its `load` event, and a fallback timeout for
// mobile Safari (which has historically been unreliable about firing `load`
// at all).
// ----------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import { socketService } from "../services/socket";
import { mapLogger } from "../utils/logger";

export interface UseMapLifecycleOptions {
  /** Called once on mount to register this page in the app store. */
  setCurrentPage: (page: string) => void;
}

export interface UseMapLifecycleResult {
  isMapLoaded: boolean;
  /** Pass as MapComponent's onLoad prop. */
  handleMapLoad: () => void;
}

/** How long to wait for MapLibre's `load` event before forcing loaded state. */
const MAP_LOAD_FALLBACK_TIMEOUT_MS = 10_000;

export function useMapLifecycle({
  setCurrentPage,
}: UseMapLifecycleOptions): UseMapLifecycleResult {
  const [isMapLoaded, setIsMapLoaded] = useState(false);

  const handleMapLoad = useCallback(() => {
    setIsMapLoaded(true);
    mapLogger.info("Map loaded successfully");
  }, []);

  useEffect(() => {
    setCurrentPage("Live Map");
    socketService.notifyPageChange("Live Map");
  }, [setCurrentPage]);

  // Fallback timeout for mobile Safari - if map doesn't fire load event
  // within 10 seconds, assume it's loaded.
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (!isMapLoaded) {
        mapLogger.warn(
          "Map load timeout - forcing loaded state for mobile Safari compatibility",
        );
        setIsMapLoaded(true);
      }
    }, MAP_LOAD_FALLBACK_TIMEOUT_MS);

    return () => clearTimeout(timeoutId);
  }, [isMapLoaded]);

  return { isMapLoaded, handleMapLoad };
}
