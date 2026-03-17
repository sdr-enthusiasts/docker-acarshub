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
 * Implements a three-tier caching strategy for the eight time-series periods:
 *
 *   Tier 1 — "warm" (1hr, 6hr, 12hr)
 *     Kept in memory at all times.  Refreshed on a wall-clock-aligned timer
 *     and broadcast to all connected clients on every refresh tick so the
 *     Stats page updates live without any client-side polling.
 *
 *   Tier 2 — "lazy" (24hr, 1wk, 30day)
 *     Not warmed at startup.  Queried from the DB on first client request,
 *     then cached with a TTL equal to the period's refreshIntervalMs.
 *     Subsequent requests within the TTL are served from memory; after expiry
 *     the DB is queried again.  Never broadcast unsolicited.
 *
 *   Tier 3 — "query-only" (6mon, 1yr)
 *     Never cached.  Every request hits the DB directly and the result is
 *     discarded immediately.  The 1yr query can scan 525,600 rows; keeping
 *     it in memory on a 12-hour timer caused a ~420 MB heap spike even when
 *     no client ever viewed the chart.
 *
 * WHY RECURSIVE setTimeout INSTEAD OF setInterval
 * ------------------------------------------------
 * setInterval accumulates drift: if a callback fires 3 ms late the next
 * callback is also 3 ms early relative to the intended wall-clock boundary.
 * Recursive setTimeout pins each next run to `previousTarget + intervalMs`,
 * so late fires self-correct on the next cycle and the timer stays aligned
 * to wall-clock boundaries regardless of execution jitter.
 *
 * WHY BROADCAST ON REFRESH (warm tier only)
 * ------------------------------------------
 * The frontend hook listens passively for rrd_timeseries_data events and
 * filters by time_period.  When the backend broadcasts on every warm-tier
 * refresh, clients viewing the Stats page receive live graph updates
 * automatically — no polling, no re-requesting, no auto-refresh timer on
 * the frontend side.  Lazy and query-only periods are served as
 * request/response only.
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
  WARM_PERIODS,
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
 * Warm cache: one pre-computed TimeSeriesResponse per warm-tier TimePeriod.
 * Populated at startup by initTimeSeriesCache() and updated on each scheduled
 * refresh.  Only "warm" tier periods are stored here.
 */
const cache = new Map<TimePeriod, TimeSeriesResponse>();

/**
 * Lazy cache: short-lived entries for "lazy" tier periods.
 * Populated on first client request and evicted after TTL expires.
 * Never used for "warm" or "query-only" periods.
 */
interface LazyCacheEntry {
  response: TimeSeriesResponse;
  /** Absolute expiry timestamp in milliseconds (Date.now() + refreshIntervalMs). */
  expiresAt: number;
}

const lazyCache = new Map<TimePeriod, LazyCacheEntry>();

/**
 * Active timeout handles keyed by period.  Each handle is a one-shot
 * setTimeout; when it fires the handler re-arms itself for the next boundary,
 * giving wall-clock-aligned self-correcting behaviour.
 * Only armed for "warm" tier periods.
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
 * Warm the "warm" tier of the time-series cache and arm wall-clock-aligned
 * refresh timers for those periods only.
 *
 * Steps:
 *  1. Run DB queries for warm-tier periods (1hr, 6hr, 12hr) immediately so
 *     the first client request for a short window is served from memory.
 *  2. Set the broadcaster so subsequent warm-tier refreshes push data to all
 *     connected clients automatically.
 *  3. Arm one wall-clock-aligned timer per warm-tier period.
 *
 * Lazy-tier periods (24hr, 1wk, 30day) are NOT warmed here — they are
 * populated on first client request via getOrQueryTimeSeries().
 *
 * Query-only periods (6mon, 1yr) are never cached and receive no timer.
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

  logger.info("Warming time-series cache (warm tier only)…", {
    warmPeriods: WARM_PERIODS.length,
    totalPeriods: ALL_TIME_PERIODS.length,
  });

  // --- Phase 1: warm only the "warm" tier periods synchronously ---
  for (const period of WARM_PERIODS) {
    try {
      const response = buildTimeSeriesResponse(period);
      cache.set(period, response);
      logger.debug("Warm cache entry populated", {
        period,
        points: response.points,
      });
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

  logger.info("Warm tier cache populated", {
    populated: cache.size,
    warmTotal: WARM_PERIODS.length,
  });

  // --- Phase 2: arm one wall-clock-aligned timer per warm-tier period ---
  for (const period of WARM_PERIODS) {
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
 * Return the cached response for the given warm-tier period, or null if the
 * cache has not yet been populated (narrow startup race window).
 *
 * Only returns data for "warm" tier periods.  For lazy and query-only periods
 * use getOrQueryTimeSeries() instead.
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
 * Return the time-series response for a period, using the appropriate cache
 * tier strategy:
 *
 *   "warm"       → read from the warm in-memory cache (same as getCachedTimeSeries).
 *                  Returns null during the narrow startup race before the
 *                  cache is populated.
 *
 *   "lazy"       → check lazyCache; if hit and not expired return the cached
 *                  entry; if miss or expired query the DB, store in lazyCache
 *                  with TTL = refreshIntervalMs, and return.
 *
 *   "query-only" → query the DB directly every time; result is never stored.
 *
 * This is the preferred call-site for socket handlers — it handles all tiers
 * transparently and always returns a result (or null for a warm-tier miss
 * during startup only).
 *
 * @param period  A TimePeriod string (already validated by the caller)
 */
export function getOrQueryTimeSeries(
  period: TimePeriod,
): TimeSeriesResponse | null {
  const config = PERIOD_CONFIG[period];

  switch (config.tier) {
    case "warm": {
      // Served from the warm push cache — populated at startup, updated on
      // the period's wall-clock-aligned refresh timer.
      return cache.get(period) ?? null;
    }

    case "lazy": {
      const now = Date.now();
      const entry = lazyCache.get(period);

      if (entry !== undefined && entry.expiresAt > now) {
        // Valid cache hit — serve without touching the DB.
        logger.debug("Lazy cache hit", {
          period,
          expiresIn: `${Math.round((entry.expiresAt - now) / 1000)}s`,
        });
        return entry.response;
      }

      // Cache miss or expired — query the DB and refresh the lazy entry.
      logger.debug("Lazy cache miss or expired — querying DB", { period });
      try {
        const response = buildTimeSeriesResponse(period);
        lazyCache.set(period, {
          response,
          expiresAt: now + config.refreshIntervalMs,
        });
        return response;
      } catch (err) {
        logger.error("Failed to build lazy time-series response", {
          period,
          error: err instanceof Error ? err.message : String(err),
        });
        // Return stale entry if available rather than nothing.
        return entry?.response ?? null;
      }
    }

    case "query-only": {
      // Query the DB on every request.  Result is discarded immediately after
      // returning — never held in memory beyond this call stack.
      logger.debug("Query-only period — querying DB directly", { period });
      try {
        return buildTimeSeriesResponse(period);
      } catch (err) {
        logger.error("Failed to build query-only time-series response", {
          period,
          error: err instanceof Error ? err.message : String(err),
        });
        return null;
      }
    }
  }
}

/**
 * Return true once all warm-tier periods have been populated in the cache.
 * Useful for health checks and startup readiness probes.
 *
 * NOTE: This now checks only the warm tier (3 periods), not all 8.  Lazy
 * and query-only periods are not pre-populated and would never cause this to
 * return true if we checked ALL_TIME_PERIODS.
 */
export function isCacheReady(): boolean {
  return cache.size === WARM_PERIODS.length;
}

/**
 * Reset all module-level state for testing purposes only.
 *
 * Clears the warm cache Map, the lazy cache Map, cancels all timers, and
 * nulls the broadcaster so that initTimeSeriesCache() can be called again
 * in the next test with a fresh state.
 *
 * @internal — Do NOT call this in production code.
 */
export function resetCacheForTesting(): void {
  for (const timer of timers.values()) {
    clearTimeout(timer);
  }
  timers.clear();
  cache.clear();
  lazyCache.clear();
  broadcaster = null;
}
