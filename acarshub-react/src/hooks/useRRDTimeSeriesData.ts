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
 * useRRDTimeSeriesData — pure store-selector hook.
 *
 * WHY THIS CHANGED
 * ----------------
 * Previously this hook owned the full request/response cycle: it emitted an
 * `rrd_timeseries` Socket.IO request on mount and whenever `timePeriod`
 * changed, then listened for a matching `rrd_timeseries_data` response.
 *
 * The backend now warms all eight periods in memory at startup and broadcasts
 * fresh results on a wall-clock-aligned schedule (every 1 min for short
 * windows, every 12 hr for the 1-year window).  The global socket handler in
 * useSocketIO writes every incoming push to `useAppStore.timeSeriesCache`.
 *
 * This hook therefore becomes a thin Zustand selector:
 *   - No socket emit on mount or period change.
 *   - No local useState — data comes directly from the shared cache.
 *   - Switching between periods is instant; no loading spinner once the
 *     cache is warm (which happens within one RTT of the connect event).
 *   - The return shape is intentionally identical to the old hook so that
 *     call-sites (StatsPage) require no changes.
 *
 * PUSH MODEL LIFECYCLE
 * --------------------
 * 1. useSocketIO fires `rrd_timeseries` for all 8 periods on every `connect`
 *    event → backend replies with `rrd_timeseries_data` for each period.
 * 2. useSocketIO's `rrd_timeseries_data` listener writes each response to
 *    `useAppStore.setTimeSeriesData`.
 * 3. Backend broadcasts a fresh `rrd_timeseries_data` on each scheduled
 *    refresh tick → useSocketIO writes it again, store updates, all
 *    subscribed components re-render.
 * 4. This hook just reads `timeSeriesCache.get(timePeriod)` — no side
 *    effects, no cleanup needed.
 */

import { useAppStore } from "../store/useAppStore";
import type {
  TimePeriod,
  TimeSeriesCacheEntry,
  TimeSeriesDataPoint,
  TimeSeriesTimeRange,
} from "../types/timeseries";

// Re-export TimePeriod so existing import sites that pull it from this
// module continue to work without modification.
export type { TimePeriod };

/**
 * Single data point shape — re-exported for consumers that reference it.
 * Alias of TimeSeriesDataPoint; kept here for backward compatibility.
 */
export type RRDDataPoint = TimeSeriesDataPoint;

/**
 * The time range extracted from a cache entry — re-exported so StatsPage
 * and the chart components can type-annotate without importing from
 * types/timeseries directly.
 */
export type RRDTimeRange = TimeSeriesTimeRange;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Read the time-series cache entry for `timePeriod` from the Zustand store.
 *
 * @param timePeriod - Which of the eight periods to surface.
 * @returns
 *   data      — Zero-filled data points for the period (empty array while loading).
 *   loading   — True only until the first push for this period arrives.
 *   error     — Always null in push mode (errors are logged server-side).
 *   timeRange — start/end in milliseconds for pinning the chart x-axis, or
 *               null while loading.
 *
 * The `autoRefresh` and `refreshInterval` parameters from the old hook are
 * accepted but ignored — the backend drives all refresh timing.
 */
export const useRRDTimeSeriesData = (
  timePeriod: TimePeriod,
  // Accepted for call-site compatibility; no longer used.
  _autoRefresh?: boolean,
  _refreshInterval?: number,
): {
  data: RRDDataPoint[];
  loading: boolean;
  error: string | null;
  timeRange: RRDTimeRange | null;
} => {
  const entry: TimeSeriesCacheEntry | undefined = useAppStore((state) =>
    state.timeSeriesCache.get(timePeriod),
  );

  if (entry === undefined) {
    return {
      data: [],
      loading: true,
      error: null,
      timeRange: null,
    };
  }

  return {
    data: entry.data,
    loading: false,
    error: null,
    timeRange: { start: entry.start, end: entry.end },
  };
};
