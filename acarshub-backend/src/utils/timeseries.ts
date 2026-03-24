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

// ---------------------------------------------------------------------------
// Cache tier classification
// ---------------------------------------------------------------------------

/**
 * How aggressively the backend caches a given time period.
 *
 * - "warm"       — Kept in memory at all times; refresh timers are armed at
 *                  startup; fresh results are broadcast to all clients on
 *                  every refresh tick.  Appropriate for short windows where
 *                  a new data point materially changes the chart shape.
 *
 * - "lazy"       — Not kept warm at startup.  Queried from the DB on first
 *                  request and cached briefly (TTL = refreshIntervalMs).
 *                  Subsequent requests within the TTL window are served from
 *                  the lazy cache; after expiry the DB is queried again.
 *                  Never broadcast unsolicited.
 *
 * - "query-only" — Never cached.  Every request hits the DB directly.
 *                  refreshIntervalMs = 0.  Appropriate for very long windows
 *                  (6mon, 1yr) where the data barely changes and the query
 *                  cost is high enough that we should NOT keep the result in
 *                  memory when no client is looking at it.
 */
export type CacheTier = "warm" | "lazy" | "query-only";

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
   *
   * Set to 0 for "query-only" periods that are never cached.
   */
  refreshIntervalMs: number;
  /**
   * Caching tier for this period.
   * Controls how aggressively the backend holds this period in memory.
   */
  tier: CacheTier;
}

/**
 * Per-period query and refresh configuration.
 *
 * Refresh cadence is intentionally coarser for longer windows:
 *
 *   1hr / 6hr / 12hr → warm tier, every 1 minute   (on the UTC :00 second)
 *   24hr             → lazy tier, TTL 5 minutes
 *   1wk              → lazy tier, TTL 30 minutes
 *   30day            → lazy tier, TTL 1 hour
 *   6mon             → query-only (refreshIntervalMs = 0, never cached)
 *   1yr              → query-only (refreshIntervalMs = 0, never cached)
 *
 * WHY THESE NUMBERS
 * -----------------
 * The stats-writer inserts one row per minute.  A new minute of data
 * produces a noticeable change on the 1hr chart (1/60 of the window) but
 * is imperceptible on the 1yr chart (1/525600 of the window).
 *
 * WHY query-only FOR 6mon/1yr
 * ---------------------------
 * Building a 1yr response requires a GROUP BY AVG over up to 525,600 rows.
 * Keeping that result in memory on a 12-hour timer causes a large, predictable
 * heap spike — measured at ~420 MB — even when no client ever looks at the
 * 1yr chart.  Making these periods query-only means the expensive query only
 * runs when a client explicitly requests those views, and the result is
 * immediately discarded rather than held in RAM indefinitely.
 */
export const PERIOD_CONFIG: Readonly<Record<TimePeriod, PeriodConfig>> = {
  "1hr": {
    startOffset: 3_600,
    downsample: 60,
    refreshIntervalMs: 60_000,
    tier: "warm",
  },
  "6hr": {
    startOffset: 21_600,
    downsample: 60,
    refreshIntervalMs: 60_000,
    tier: "warm",
  },
  "12hr": {
    startOffset: 43_200,
    downsample: 60,
    refreshIntervalMs: 60_000,
    tier: "warm",
  },
  "24hr": {
    startOffset: 86_400,
    downsample: 300,
    refreshIntervalMs: 300_000,
    tier: "lazy",
  },
  "1wk": {
    startOffset: 604_800,
    downsample: 1_800,
    refreshIntervalMs: 1_800_000,
    tier: "lazy",
  },
  "30day": {
    startOffset: 2_592_000,
    downsample: 3_600,
    refreshIntervalMs: 3_600_000,
    tier: "lazy",
  },
  "6mon": {
    startOffset: 15_768_000,
    downsample: 21_600,
    refreshIntervalMs: 0,
    tier: "query-only",
  },
  "1yr": {
    startOffset: 31_536_000,
    downsample: 43_200,
    refreshIntervalMs: 0,
    tier: "query-only",
  },
} as const;

/**
 * The subset of TimePeriod values that use the "warm" cache tier.
 *
 * These are the periods kept in memory at all times and broadcast to clients
 * on every scheduled refresh.  The frontend requests exactly these periods
 * on connect so the Stats page loads instantly for common short-window views.
 *
 * Exported here (the single source of truth) so that both timeseries-cache.ts
 * and the frontend types/timeseries.ts can derive their own constants from
 * PERIOD_CONFIG rather than duplicating the literal list.
 */
export const WARM_PERIODS: readonly TimePeriod[] = (
  Object.entries(PERIOD_CONFIG) as [TimePeriod, PeriodConfig][]
)
  .filter(([, cfg]) => cfg.tier === "warm")
  .map(([period]) => period);

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
