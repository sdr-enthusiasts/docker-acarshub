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
// GOD-07: extracted from store/useAppStore.ts. Analytics/telemetry pushes
// from the backend that feed the Stats page: database size, signal levels,
// frequency/count stats, station IDs, rolling message rate, and the
// time-series cache.
// ----------------------------------------------------------------------------

import type { StateCreator } from "zustand";
import type {
  DatabaseSize,
  MessageRateData,
  SignalCountData,
  SignalFreqData,
  SignalLevelData,
} from "../../types";
import type { TimePeriod, TimeSeriesCacheEntry } from "../../types/timeseries";
import { storeLogger } from "../../utils/logger";

export interface StatsSlice {
  // Database info
  databaseSize: DatabaseSize | null;
  setDatabaseSize: (size: DatabaseSize) => void;

  // Signal levels
  signalLevels: SignalLevelData | null;
  setSignalLevels: (signal: SignalLevelData) => void;

  // Statistics data
  signalFreqData: SignalFreqData | null;
  setSignalFreqData: (data: SignalFreqData) => void;
  signalCountData: SignalCountData | null;
  setSignalCountData: (data: SignalCountData) => void;

  // Station IDs (unique sources seen across all message types)
  stationIds: string[];
  setStationIds: (ids: string[]) => void;

  // Rolling message rate (updated every 5 seconds by the backend scheduler)
  messageRate: MessageRateData | null;
  setMessageRate: (data: MessageRateData) => void;

  /**
   * Non-persistent time-series cache.
   *
   * Populated by rrd_timeseries_data Socket.IO pushes from the backend.
   * All eight TimePeriod entries are requested on every connect event so
   * the cache is warm before the user navigates to the Stats page.
   * Switching between periods is instant — no socket round-trip needed.
   */
  timeSeriesCache: Map<TimePeriod, TimeSeriesCacheEntry>;
  setTimeSeriesData: (period: TimePeriod, entry: TimeSeriesCacheEntry) => void;
}

export const createStatsSlice: StateCreator<StatsSlice, [], [], StatsSlice> = (
  set,
) => ({
  databaseSize: null,
  setDatabaseSize: (size) => {
    storeLogger.debug("Database size updated", {
      size: size.size,
      count: size.count,
    });
    set({ databaseSize: size });
  },

  signalLevels: null,
  setSignalLevels: (signal) => {
    storeLogger.trace("Signal levels updated");
    set({ signalLevels: signal });
  },

  signalFreqData: null,
  setSignalFreqData: (data) => set({ signalFreqData: data }),
  signalCountData: null,
  setSignalCountData: (data) => set({ signalCountData: data }),

  stationIds: [],
  setStationIds: (ids) => set({ stationIds: ids }),

  messageRate: null,
  setMessageRate: (data) => set({ messageRate: data }),

  timeSeriesCache: new Map(),
  setTimeSeriesData: (period, entry) =>
    set((state) => ({
      timeSeriesCache: new Map(state.timeSeriesCache).set(period, entry),
    })),
});
