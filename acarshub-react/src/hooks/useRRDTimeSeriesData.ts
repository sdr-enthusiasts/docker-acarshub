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
 * useRRDTimeSeriesData — store-selector hook with on-demand emit for non-warm
 * periods.
 *
 * PUSH MODEL (warm periods: 1hr, 6hr, 12hr)
 * ------------------------------------------
 * The backend pre-computes these periods at startup, keeps them in memory, and
 * broadcasts fresh results on a wall-clock-aligned schedule.  useSocketIO
 * pre-fetches all warm periods on every connect event, so this hook is a pure
 * Zustand selector for those periods — no socket emit needed on mount.
 *
 * ON-DEMAND REQUEST (non-warm periods: 24hr, 1wk, 30day, 6mon, 1yr)
 * ------------------------------------------------------------------
 * Non-warm periods are NOT pre-fetched on connect.  When a component first
 * renders with a non-warm period (i.e. the user navigates to that view), this
 * hook emits a single `rrd_timeseries` request if the period is not yet in the
 * cache.  The backend responds with a `rrd_timeseries_data` event which
 * useSocketIO writes to the store, causing this hook to re-render with data.
 *
 * WHY EMIT ONLY ON CACHE MISS
 * ----------------------------
 * Warm periods: served from push cache — no emit ever needed.
 * Non-warm periods with cache hit: stale-while-revalidate is fine here because
 *   the lazy cache on the backend has a TTL; re-mounting the same view within
 *   the TTL window will serve the existing entry without an extra DB query.
 * Non-warm periods on cache miss: emit once so the backend runs the (possibly
 *   expensive) DB query and caches the result.
 *
 * RETURN SHAPE
 * ------------
 * Identical to the old hook so call-sites (StatsPage) require no changes.
 */

import { useEffect } from "react";
import { socketService } from "../services/socket";
import { useAppStore } from "../store/useAppStore";
import type {
  TimePeriod,
  TimeSeriesCacheEntry,
  TimeSeriesDataPoint,
  TimeSeriesTimeRange,
} from "../types/timeseries";
import { WARM_PERIODS } from "../types/timeseries";

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
 * Emits a `rrd_timeseries` socket request when a non-warm period has no cache
 * entry yet (lazy on-demand fetch).
 *
 * @param timePeriod - Which of the eight periods to surface.
 * @returns
 *   data      — Zero-filled data points for the period (empty array while loading).
 *   loading   — True only until the first response for this period arrives.
 *   error     — Always null (errors are logged server-side).
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

  // For non-warm periods: emit a socket request when the cache entry is absent
  // so the backend runs the on-demand query and replies with rrd_timeseries_data.
  // Warm periods are pre-fetched by useSocketIO on connect — no emit needed here.
  useEffect(() => {
    const isWarm = (WARM_PERIODS as readonly string[]).includes(timePeriod);
    if (!isWarm && entry === undefined && socketService.isInitialized()) {
      const socket = socketService.getSocket();
      // @ts-expect-error — Flask-SocketIO requires namespace as third arg
      socket.emit("rrd_timeseries", { time_period: timePeriod }, "/main");
    }
  }, [timePeriod, entry]);

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
