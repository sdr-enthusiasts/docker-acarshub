// Copyright (C) 2022-2026 Frederick Clausen II
// This file is part of acarshub <https://github.com/sdr-enthusiasts/docker-acarshub>.
//
// acarshub is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// acarshub is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with acarshub.  If not, see <http://www.gnu.org/licenses/>.

/**
 * Time-series utility types and pure functions.
 *
 * This module is shared between the timeseries-cache service (which queries
 * the database and keeps results warm) and the socket handler (which handles
 * the legacy explicit start/end path).  Keeping these primitives here avoids
 * a circular import between services/ and socket/.
 *
 * Nothing in this file touches the database, the network, or the filesystem.
 * Every export is a pure value or a pure function — safe to use in tests
 * without any mocking.
 */

// ---------------------------------------------------------------------------
// TimePeriod
// ---------------------------------------------------------------------------

/**
 * The eight time-window keys supported by the Stats page graph selector.
 * Must stay in sync with the frontend's TimePeriod type in
 * acarshub-react/src/hooks/useRRDTimeSeriesData.ts.
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
 * All valid TimePeriod values as an immutable array.
 * Used for runtime validation and to drive the startup warm loop.
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
 * Type guard — true when s is one of the eight valid TimePeriod strings.
 */
export function isValidTimePeriod(s: string): s is TimePeriod {
  return (ALL_TIME_PERIODS as readonly string[]).includes(s);
}

// ---------------------------------------------------------------------------
// Data-point shapes
// ---------------------------------------------------------------------------

/**
 * A single time-series data point with timestamps in Unix **seconds**.
 *
 * Used internally by zeroFillBuckets and by buildTimeSeriesResponse before
 * the seconds → milliseconds conversion happens.
 */
export interface TimeSeriesRawPoint {
  timestamp: number; // Unix seconds
  acars: number;
  vdlm: number;
  hfdl: number;
  imsl: number;
  irdm: number;
  total: number;
  error: number;
}

/**
 * A single time-series data point with timestamps in Unix **milliseconds**.
 *
 * This is the shape used in the emitted rrd_timeseries_data response so
 * Chart.js can consume the timestamps directly on its time scale.
 */
export interface TimeSeriesDataPoint {
  timestamp: number; // Unix milliseconds
  acars: number;
  vdlm: number;
  hfdl: number;
  imsl: number;
  irdm: number;
  total: number;
  error: number;
}

/**
 * The full payload emitted as the rrd_timeseries_data Socket.IO event.
 *
 * start / end are in milliseconds and pin the chart x-axis to the exact
 * requested window regardless of whether the database has data for every
 * bucket — the zero-fill step ensures it does, but the explicit range
 * prevents Chart.js from auto-scaling to the data extents.
 */
export interface TimeSeriesResponse {
  data: TimeSeriesDataPoint[];
  time_period: TimePeriod;
  /** Range start in Unix milliseconds */
  start: number;
  /** Range end in Unix milliseconds */
  end: number;
  points: number;
}

// ---------------------------------------------------------------------------
// Period configuration
// ---------------------------------------------------------------------------

/**
 * Configuration for one time-period entry in the cache.
 */
export interface PeriodConfig {
  /** How far back from now to query, in seconds */
  startOffset: number;
  /**
   * Bucket width in seconds.
   *
   * For 1hr / 6hr / 12hr this is 60 (raw 1-minute rows from timeseries_stats).
   * For longer windows the raw rows are averaged into wider buckets via SQL
   * GROUP BY so the chart data stays at a manageable point count.
   */
  downsample: number;
  /**
   * How often the cache entry is refreshed, in milliseconds.
   *
   * Refresh timers are wall-clock aligned — see getNextWallClockBoundary().
   * The shortest-lived windows are refreshed most frequently because new data
   * (written every minute by the stats-writer) makes the most visible
   * difference there.
   */
  refreshIntervalMs: number;
}

/**
 * Per-period query and refresh configuration.
 *
 * Refresh cadence is intentionally coarser for longer windows:
 *
 *   1hr / 6hr / 12hr → every 1 minute   (on the UTC :00 second)
 *   24hr             → every 5 minutes   (00:00, 00:05, 00:10 …)
 *   1wk              → every 30 minutes  (00:00, 00:30, 01:00 …)
 *   30day            → every 1 hour      (00:00, 01:00, 02:00 …)
 *   6mon             → every 6 hours     (00:00, 06:00, 12:00, 18:00 UTC)
 *   1yr              → every 12 hours    (00:00, 12:00 UTC)
 *
 * WHY THESE NUMBERS
 * -----------------
 * The stats-writer inserts one row per minute.  A new minute of data
 * produces a noticeable change on the 1hr chart (1/60 of the window) but
 * is imperceptible on the 1yr chart (1/525600 of the window).  Refreshing
 * the 1yr cache every 12 hours matches the downsample bucket width (43200 s)
 * so the chart never shows a partial bucket at the trailing edge.
 */
export const PERIOD_CONFIG: Readonly<Record<TimePeriod, PeriodConfig>> = {
  "1hr": {
    startOffset: 3_600,
    downsample: 60,
    refreshIntervalMs: 60_000,
  },
  "6hr": {
    startOffset: 21_600,
    downsample: 60,
    refreshIntervalMs: 60_000,
  },
  "12hr": {
    startOffset: 43_200,
    downsample: 60,
    refreshIntervalMs: 60_000,
  },
  "24hr": {
    startOffset: 86_400,
    downsample: 300,
    refreshIntervalMs: 300_000,
  },
  "1wk": {
    startOffset: 604_800,
    downsample: 1_800,
    refreshIntervalMs: 1_800_000,
  },
  "30day": {
    startOffset: 2_592_000,
    downsample: 3_600,
    refreshIntervalMs: 3_600_000,
  },
  "6mon": {
    startOffset: 15_768_000,
    downsample: 21_600,
    refreshIntervalMs: 21_600_000,
  },
  "1yr": {
    startOffset: 31_536_000,
    downsample: 43_200,
    refreshIntervalMs: 43_200_000,
  },
} as const;

// ---------------------------------------------------------------------------
// Zero-fill
// ---------------------------------------------------------------------------

/**
 * Zero-fill a time-series result set so every bucket in [start, end] is
 * represented.
 *
 * Rows that exist in dbRows are preserved as-is.  Missing buckets are
 * synthesised with all-zero counts so the chart renders a flat baseline
 * for silent periods instead of drawing a straight line between the tips
 * of adjacent spikes.
 *
 * All timestamps (input and output) are in Unix **seconds** — the
 * seconds → milliseconds conversion is the caller's responsibility.
 *
 * @param dbRows  Rows already sorted ascending by timestamp
 * @param start   Range start in Unix seconds (inclusive)
 * @param end     Range end   in Unix seconds (inclusive)
 * @param step    Bucket width in seconds (e.g. 60, 300, 1800 …)
 * @returns       Complete set of buckets from alignedStart to end
 */
export function zeroFillBuckets(
  dbRows: TimeSeriesRawPoint[],
  start: number,
  end: number,
  step: number,
): TimeSeriesRawPoint[] {
  // Build a lookup map keyed by the aligned bucket timestamp so rows with
  // slightly off timestamps (possible after GROUP BY rounding) still match.
  const rowMap = new Map<number, TimeSeriesRawPoint>();
  for (const row of dbRows) {
    const bucketTs = Math.floor(row.timestamp / step) * step;
    rowMap.set(bucketTs, { ...row, timestamp: bucketTs });
  }

  const filled: TimeSeriesRawPoint[] = [];

  // Align the loop start to the same bucket grid used during the query so
  // the first bucket is never a partial window.
  const alignedStart = Math.floor(start / step) * step;

  for (let ts = alignedStart; ts <= end; ts += step) {
    const existing = rowMap.get(ts);
    if (existing) {
      filled.push(existing);
    } else {
      filled.push({
        timestamp: ts,
        acars: 0,
        vdlm: 0,
        hfdl: 0,
        imsl: 0,
        irdm: 0,
        total: 0,
        error: 0,
      });
    }
  }

  return filled;
}

// ---------------------------------------------------------------------------
// Wall-clock alignment
// ---------------------------------------------------------------------------

/**
 * Return the next wall-clock-aligned boundary for the given interval.
 *
 * Uses the Unix epoch (1970-01-01 00:00:00 UTC) as the alignment anchor so
 * all boundaries fall on exact UTC clock marks:
 *
 *   intervalMs = 60 000      → next full UTC minute (:00)
 *   intervalMs = 300 000     → next 5-minute mark   (:00, :05, :10 …)
 *   intervalMs = 3 600 000   → next full UTC hour
 *   intervalMs = 21 600 000  → next 6-hour mark (00:00, 06:00, 12:00, 18:00)
 *   intervalMs = 43 200 000  → next 12-hour mark (00:00, 12:00 UTC)
 *
 * WHY Math.ceil AND NOT Math.floor
 * ---------------------------------
 * Math.floor(now / interval) * interval gives the PREVIOUS boundary (≤ now).
 * Math.ceil gives the NEXT boundary (> now), which is what a "schedule the
 * first run at the next aligned tick" use-case requires.  If `now` happens
 * to land exactly on a boundary, Math.ceil returns `now` itself — the caller
 * should guard against a near-zero delay by using Math.max(0, delay) when
 * computing the setTimeout argument.
 *
 * @param intervalMs  Interval length in milliseconds
 * @returns           The next boundary timestamp in milliseconds
 */
export function getNextWallClockBoundary(intervalMs: number): number {
  const now = Date.now();
  return Math.ceil(now / intervalMs) * intervalMs;
}
