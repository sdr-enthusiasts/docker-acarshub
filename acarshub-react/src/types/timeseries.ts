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
 * Frontend time-series types.
 *
 * These types mirror the backend's utils/timeseries.ts definitions so that
 * the Socket.IO rrd_timeseries_data payload can be consumed directly by the
 * store and the UI without any mapping layer.
 *
 * WHY a separate module
 * ---------------------
 * Several files need these types (useAppStore, useSocketIO, useRRDTimeSeriesData,
 * StatsPage).  Centralising them here avoids circular imports and makes the
 * contract with the backend explicit and easy to audit.
 */

// ---------------------------------------------------------------------------
// TimePeriod
// ---------------------------------------------------------------------------

/**
 * The eight time-window keys supported by the Stats page graph selector.
 * Must stay in sync with the backend's TimePeriod type in
 * acarshub-backend/src/utils/timeseries.ts.
 */
export type TimePeriod =
  | "1hr"
  | "6hr"
  | "12hr"
  | "24hr"
  | "1wk"
  | "30day"
  | "6mon"
  | "1yr";

/**
 * All valid TimePeriod values as a readonly tuple, in the same order the
 * backend uses them.  Useful for iterating over all periods (e.g. to
 * request a warm-up of every period on connect).
 */
export const ALL_TIME_PERIODS: readonly TimePeriod[] = [
  "1hr",
  "6hr",
  "12hr",
  "24hr",
  "1wk",
  "30day",
  "6mon",
  "1yr",
] as const;

/**
 * Runtime type guard — returns true when s is one of the eight valid
 * TimePeriod strings.  Used in useSocketIO to validate incoming payloads
 * before writing them to the cache.
 */
export function isValidTimePeriod(s: string): s is TimePeriod {
  return (ALL_TIME_PERIODS as readonly string[]).includes(s);
}

// ---------------------------------------------------------------------------
// Data-point shape
// ---------------------------------------------------------------------------

/**
 * A single time-series data point with the timestamp in Unix milliseconds.
 *
 * This matches the TimeSeriesDataPoint shape emitted by the backend so that
 * Chart.js can consume timestamps directly on its time scale without
 * any conversion.
 */
export interface TimeSeriesDataPoint {
  /** Unix timestamp in milliseconds */
  timestamp: number;
  acars: number;
  vdlm: number;
  hfdl: number;
  imsl: number;
  irdm: number;
  total: number;
  error: number;
}

// ---------------------------------------------------------------------------
// Cache entry — the full payload stored per period
// ---------------------------------------------------------------------------

/**
 * One entry in the frontend time-series cache.
 *
 * This is a direct 1-to-1 mapping of the backend's rrd_timeseries_data
 * Socket.IO event payload (TimeSeriesResponse in the backend).  The store
 * keeps one entry per TimePeriod and replaces it on every push from the
 * server.
 *
 * start / end pin the Chart.js x-axis to the exact requested window so the
 * chart never auto-scales to the data extents — even when some buckets are
 * zero-filled.
 */
export interface TimeSeriesCacheEntry {
  /** The period this entry belongs to — used to route incoming pushes. */
  time_period: TimePeriod;
  /** Zero-filled data points covering [start, end] at the period's bucket width. */
  data: TimeSeriesDataPoint[];
  /** Range start in Unix milliseconds (pin the chart x-axis left edge). */
  start: number;
  /** Range end in Unix milliseconds (pin the chart x-axis right edge). */
  end: number;
  /** data.length — provided by the backend for quick sanity checks. */
  points: number;
}

// ---------------------------------------------------------------------------
// Convenience alias used by the hook's return type
// ---------------------------------------------------------------------------

/**
 * The time range extracted from a cache entry, in milliseconds.
 * Passed to the chart so it can pin both axis edges explicitly.
 */
export interface TimeSeriesTimeRange {
  start: number;
  end: number;
}
