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
// GOD-07: extracted from store/useAppStore.ts. ADS-B feed status and live
// aircraft data (used by the map and by messagesSlice's ADS-B-aware
// culling).
// ----------------------------------------------------------------------------

import type { StateCreator } from "zustand";
import type { ADSBData, AdsbStatus } from "../../types";
import { storeLogger } from "../../utils/logger";

export interface AdsbSlice {
  // ADS-B status
  adsbStatus: AdsbStatus | null;
  setAdsbStatus: (status: AdsbStatus) => void;

  // ADS-B aircraft data
  adsbAircraft: ADSBData | null;
  setAdsbAircraft: (data: ADSBData) => void;
}

export const createAdsbSlice: StateCreator<AdsbSlice, [], [], AdsbSlice> = (
  set,
) => ({
  adsbStatus: null,
  setAdsbStatus: (status) => {
    storeLogger.trace("ADS-B status updated", status);
    set({ adsbStatus: status });
  },

  adsbAircraft: null,
  setAdsbAircraft: (data) => {
    storeLogger.trace("ADS-B aircraft data updated", {
      aircraftCount: data.aircraft?.length || 0,
    });
    set({ adsbAircraft: data });
  },
});
