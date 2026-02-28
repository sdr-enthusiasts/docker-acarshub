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
 * Time-series cache service
 *
 * Maintains an in-memory copy of all 8 pre-computed time-series responses
 * (1hr, 6hr, 12hr, 24hr, 1wk, 30day, 6mon, 1yr).  Each entry is refreshed
 * at a wall-clock-aligned interval appropriate to its resolution:
 *
 *   1hr / 6hr / 12hr → every minute    (on the UTC :00 second)
 *   24hr             → every 5 minutes
 *   1wk              → every 30 minutes
 *   30day            → every hour
 *   6mon             → every 6 hours
 *   1yr              → every 12 hours
 *
 * WHY NOT QUERY PER REQUEST
 * -------------------------
 * The Stats page previously queried the database on every socket event —
 * once per connected client, per time-period change.  For the 1yr period
 * this is a GROUP BY AVG over potentially hundreds of thousands of rows,
 * which is measurably slow on embedded ARM hardware.
 *
 * Keeping all 8 results warm in memory makes every client request O(1) and
 * eliminates all database I/O from the hot request path.
 *
 * WHY RECURSIVE setTimeout INSTEAD OF setInterval
 * ------------------------------------------------
 * setInterval accumulates drift: if a callback fires 3 ms late the next
 * callback is also 3 ms early relative to the intended wall-clock boundary.
 * Recursive setTimeout pins each next run to `previousTarget + intervalMs`,
 * so late fires self-correct on the next cycle and the timer stays aligned
 * to wall-clock boundaries regardless of execution jitter.
 *
 * WHY BROADCAST ON REFRESH
 * ------------------------
 * The frontend hook listens passively for rrd_timeseries_data events and
 * filters by time_period.  When the backend broadcasts on every refresh,
 * clients viewing the Stats page receive live graph updates automatically —
 * no polling, no re-requesting, no auto-refresh timer on the frontend side.
 */

import { and, gte, lte, sql } from "drizzle-orm";
import { getDatabase } from "../db/index.js";
import { timeseriesStats } from "../db/schema.js";
import { createLogger } from "../utils/logger.js";
import {
  ALL_TIME_PERIODS,
  getNextWallClockBoundary,
  PERIOD_CONFIG,
  type TimePeriod,
  type TimeSeriesDataPoint,
  type TimeSeriesRawPoint,
  type TimeSeriesResponse,
  zeroFillBuckets,
} from "../utils/timeseries.js";

const logger = createLogger("timeseries-cache");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// Re-export so callers only need one import for the common types.
export type {
  TimePeriod,
  TimeSeriesDataPoint,
  TimeSeriesResponse,
} from "../utils/timeseries.js";

/**
 * Injected by server.ts; called after every cache refresh so the fresh
 * payload is pushed to all connected clients on the /main namespace.
 */
type Broadcaster = (period: TimePeriod, data: TimeSeriesResponse) => void;

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

/**
 * Warm cache: one pre-computed TimeSeriesResponse per TimePeriod.
 * Populated at startup by initTimeSeriesCache() and updated on each scheduled
 * refresh.
 */
const cache = new Map<TimePeriod, TimeSeriesResponse>();

/**
 * Active timeout handles keyed by period.  Each handle is a one-shot
 * setTimeout; when it fires the handler re-arms itself for the next boundary,
 * giving wall-clock-aligned self-correcting behaviour.
 */
const timers = new Map<TimePeriod, ReturnType<typeof setTimeout>>();

/** Injected broadcaster; null until initTimeSeriesCache() is called. */
let broadcaster: Broadcaster | null = null;

// ---------------------------------------------------------------------------
// Database query
// ---------------------------------------------------------------------------

/**
 * Build a time-series response for one period by querying timeseries_stats.
 *
 * This is the ONLY function in this module that touches the database.
 * It is called once per period at startup (warm) and then on each scheduled
 * refresh interval.  All other code paths read from the in-memory cache.
 *
 * @param period  The time-period to query
 * @returns       A fully-formed TimeSeriesResponse ready to emit
 */
export function buildTimeSeriesResponse(
  period: TimePeriod,
): TimeSeriesResponse {
  const config = PERIOD_CONFIG[period];
  const nowSec = Math.floor(Date.now() / 1000);
  const start = nowSec - config.startOffset;
  const end = nowSec;
  const { downsample } = config;

  let rawRows: TimeSeriesRawPoint[];

  if (downsample > 60) {
    // -------------------------------------------------------------------
    // Downsampled path (24hr, 1wk, 30day, 6mon, 1yr)
    //
    // Bucket the 1-minute rows into wider windows using SQL GROUP BY + AVG.
    // Drizzle ORM does not expose arbitrary FLOOR arithmetic in its query
    // builder, so we use sql.raw().
    //
    // The `downsample` value is an integer literal from PERIOD_CONFIG — it
    // is never user-supplied — so there is no SQL-injection risk here.
    // -------------------------------------------------------------------
    const db = getDatabase();
    const results = db.all(
      sql.raw(`
        SELECT
          (timestamp / ${downsample}) * ${downsample} AS bucket_timestamp,
          ROUND(AVG(acars_count))  AS acars_count,
          ROUND(AVG(vdlm_count))   AS vdlm_count,
          ROUND(AVG(hfdl_count))   AS hfdl_count,
          ROUND(AVG(imsl_count))   AS imsl_count,
          ROUND(AVG(irdm_count))   AS irdm_count,
          ROUND(AVG(total_count))  AS total_count,
          ROUND(AVG(error_count))  AS error_count
        FROM timeseries_stats
        WHERE timestamp >= ${start}
          AND timestamp <= ${end}
        GROUP BY bucket_timestamp
        ORDER BY bucket_timestamp
      `),
    ) as Array<{
      bucket_timestamp: number;
      acars_count: number;
      vdlm_count: number;
      hfdl_count: number;
      imsl_count: number;
      irdm_count: number;
      total_count: number;
      error_count: number;
    }>;

    rawRows = results.map((row) => ({
      timestamp: row.bucket_timestamp,
      acars: row.acars_count ?? 0,
      vdlm: row.vdlm_count ?? 0,
      hfdl: row.hfdl_count ?? 0,
      imsl: row.imsl_count ?? 0,
      irdm: row.irdm_count ?? 0,
      total: row.total_count ?? 0,
      error: row.error_count ?? 0,
    }));
  } else {
    // -------------------------------------------------------------------
    // 1-minute resolution path (1hr, 6hr, 12hr)
    //
    // These periods have downsample = 60, matching the timeseries_stats
    // row granularity exactly, so no aggregation is needed.
    // -------------------------------------------------------------------
    const db = getDatabase();
    const rows = db
      .select()
      .from(timeseriesStats)
      .where(
        and(
          gte(timeseriesStats.timestamp, start),
          lte(timeseriesStats.timestamp, end),
        ),
      )
      .orderBy(timeseriesStats.timestamp)
      .all();

    rawRows = rows.map((row) => ({
      timestamp: row.timestamp,
      acars: row.acarsCount ?? 0,
      vdlm: row.vdlmCount ?? 0,
      hfdl: row.hfdlCount ?? 0,
      imsl: row.imslCount ?? 0,
      irdm: row.irdmCount ?? 0,
      total: row.totalCount ?? 0,
      error: row.errorCount ?? 0,
    }));
  }

  // Zero-fill so every bucket in [start, end] is represented even when the
  // database has no data for a quiet period.
  const filled = zeroFillBuckets(rawRows, start, end, downsample);

  // Convert timestamps from seconds to milliseconds for Chart.js time scale.
  const data: TimeSeriesDataPoint[] = filled.map((row) => ({
    ...row,
    timestamp: row.timestamp * 1000,
  }));

  return {
    data,
    time_period: period,
    start: start * 1000,
    end: end * 1000,
    points: data.length,
  };
}

// ---------------------------------------------------------------------------
// Refresh + scheduling
// ---------------------------------------------------------------------------

/**
 * Refresh one cache entry, broadcast the result to all connected clients,
 * then schedule the next refresh at the next wall-clock boundary.
 *
 * The next run is pinned to `targetTimeMs + intervalMs` (not `Date.now() +
 * intervalMs`) so any execution latency self-corrects across cycles.
 *
 * @param period        The period to refresh
 * @param targetTimeMs  The wall-clock ms timestamp this refresh was targeted
 *                      for (used to compute the next target without drift)
 */
function refreshPeriod(period: TimePeriod, targetTimeMs: number): void {
  try {
    const response = buildTimeSeriesResponse(period);
    cache.set(period, response);

    if (broadcaster) {
      broadcaster(period, response);
    }

    logger.debug("Time-series cache refreshed", {
      period,
      points: response.points,
    });
  } catch (err) {
    logger.error("Failed to refresh time-series cache entry", {
      period,
      error: err instanceof Error ? err.message : String(err),
    });
    // Do not rethrow — a failed refresh leaves the previous cached value
    // in place, which is stale but better than nothing.
  }

  // Arm the next refresh.  Pinning to targetTimeMs + interval (not
  // Date.now() + interval) means accumulated jitter never shifts the timer
  // off the wall-clock boundary.
  const { refreshIntervalMs } = PERIOD_CONFIG[period];
  const nextTarget = targetTimeMs + refreshIntervalMs;
  const delay = Math.max(0, nextTarget - Date.now());

  const timer = setTimeout(() => {
    refreshPeriod(period, nextTarget);
  }, delay);

  timers.set(period, timer);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Warm the time-series cache and arm wall-clock-aligned refresh timers.
 *
 * Steps:
 *  1. Run all 8 DB queries immediately so the first client request is served
 *     from memory rather than hitting the database.
 *  2. Set the broadcaster so subsequent refreshes push data to all clients.
 *  3. Arm one wall-clock-aligned timer per period.
 *
 * Must be called after initDatabase() returns.
 * Safe to call multiple times — subsequent calls are no-ops.
 *
 * @param bc  Callback that broadcasts a response to every client currently
 *            connected to the /main Socket.IO namespace
 */
export function initTimeSeriesCache(bc: Broadcaster): void {
  if (timers.size > 0) {
    logger.warn("Time-series cache already initialized — skipping");
    return;
  }

  broadcaster = bc;

  logger.info("Warming time-series cache…", {
    periods: ALL_TIME_PERIODS.length,
  });

  // --- Phase 1: warm every period synchronously ---
  for (const period of ALL_TIME_PERIODS) {
    try {
      const response = buildTimeSeriesResponse(period);
      cache.set(period, response);
      logger.debug("Cache entry warmed", { period, points: response.points });
    } catch (err) {
      logger.error(
        "Failed to warm cache entry — period will be empty until next refresh",
        {
          period,
          error: err instanceof Error ? err.message : String(err),
        },
      );
    }
  }

  logger.info("Time-series cache warm", {
    populated: cache.size,
    total: ALL_TIME_PERIODS.length,
  });

  // --- Phase 2: arm one wall-clock-aligned timer per period ---
  for (const period of ALL_TIME_PERIODS) {
    const { refreshIntervalMs } = PERIOD_CONFIG[period];
    const nextBoundary = getNextWallClockBoundary(refreshIntervalMs);
    const delay = nextBoundary - Date.now();

    const timer = setTimeout(() => {
      refreshPeriod(period, nextBoundary);
    }, delay);

    timers.set(period, timer);

    logger.debug("Refresh timer armed", {
      period,
      intervalMs: refreshIntervalMs,
      firstRefreshIn: `${Math.round(delay / 1000)}s`,
      firstRefreshAt: new Date(nextBoundary).toISOString(),
    });
  }
}

/**
 * Stop all refresh timers.
 *
 * Called during server shutdown to prevent callbacks from firing after the
 * database connection has been closed.  The in-memory cache is left intact
 * (it will be garbage-collected with the process).
 */
export function stopTimeSeriesCache(): void {
  for (const timer of timers.values()) {
    clearTimeout(timer);
  }
  timers.clear();
  logger.info("Time-series cache timers stopped");
}

/**
 * Return the cached response for the given period, or null if the cache has
 * not yet been populated for that period (narrow startup race window).
 *
 * Callers are responsible for validating the period with isValidTimePeriod()
 * before calling this function.  Invalid period strings are not stored in the
 * cache and will always return null.
 *
 * @param period  A TimePeriod string (already validated by the caller)
 */
export function getCachedTimeSeries(
  period: TimePeriod,
): TimeSeriesResponse | null {
  return cache.get(period) ?? null;
}

/**
 * Return true once all 8 periods have been populated in the cache.
 * Useful for health checks and startup readiness probes.
 */
export function isCacheReady(): boolean {
  return cache.size === ALL_TIME_PERIODS.length;
}

/**
 * Reset all module-level state for testing purposes only.
 *
 * Clears the cache Map, cancels all timers, and nulls the broadcaster so
 * that initTimeSeriesCache() can be called again in the next test with a
 * fresh state.
 *
 * @internal — Do NOT call this in production code.
 */
export function resetCacheForTesting(): void {
  for (const timer of timers.values()) {
    clearTimeout(timer);
  }
  timers.clear();
  cache.clear();
  broadcaster = null;
}
