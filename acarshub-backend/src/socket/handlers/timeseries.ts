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
 * Socket.IO rrd_timeseries handler (GOD-01 split from socket/handlers.ts)
 */

import { sql } from "drizzle-orm";
import { getDatabase } from "../../db/index.js";
import { queryTimeseriesData } from "../../services/rrd-migration.js";
import { getOrQueryTimeSeries } from "../../services/timeseries-cache.js";
import { createLogger } from "../../utils/logger.js";
import { isValidTimePeriod, zeroFillBuckets } from "../../utils/timeseries.js";
import type { TypedSocket } from "../types.js";

const logger = createLogger("socket:handlers-timeseries");

/**
 * Handle rrd_timeseries request
 *
 * time_period path (primary):
 *   Serves directly from the in-memory timeseries cache — no database access.
 *   The cache is warmed at startup by initTimeSeriesCache() and refreshed on
 *   wall-clock-aligned intervals per period.  When the cache refreshes it also
 *   broadcasts the new payload to all connected clients, so this handler only
 *   needs to respond to the initial "I just navigated to the Stats page" request
 *   from each socket.
 *
 * Explicit start/end path (legacy/debug):
 *   When no time_period is given, falls back to querying the database directly
 *   with caller-supplied start, end, and downsample parameters.  This path is
 *   not used by the Stats page UI.
 */
export async function handleRRDTimeseries(
  socket: TypedSocket,
  params: {
    time_period?: string; // "1hr" | "6hr" | "12hr" | "24hr" | "1wk" | "30day" | "6mon" | "1yr"
    start?: number; // Unix timestamp (seconds) — explicit path only
    end?: number; // Unix timestamp (seconds) — explicit path only
    downsample?: number; // Bucket size in seconds — explicit path only
  },
): Promise<void> {
  try {
    // -----------------------------------------------------------------
    // Primary path: time_period → serve from warm in-memory cache
    // -----------------------------------------------------------------
    if (params.time_period !== undefined) {
      const period = params.time_period;

      if (!isValidTimePeriod(period)) {
        socket.emit("rrd_timeseries_data", {
          error: `Invalid time period: ${period}`,
          data: [],
          time_period: period,
          points: 0,
        });
        return;
      }

      const result = getOrQueryTimeSeries(period);

      if (result !== null) {
        socket.emit("rrd_timeseries_data", result);
        logger.debug("Served time-series response", {
          socketId: socket.id,
          period,
          points: result.points,
        });
      } else {
        // Narrow startup race: warm-tier cache hasn't finished populating yet.
        // Lazy and query-only periods return null only when the DB query fails.
        socket.emit("rrd_timeseries_data", {
          error: "Time-series data unavailable — retry in a moment",
          data: [],
          time_period: period,
          points: 0,
        });
        logger.warn("Time-series response unavailable", {
          socketId: socket.id,
          period,
        });
      }
      return;
    }

    // -----------------------------------------------------------------
    // Legacy/debug path: explicit start / end / downsample → query DB
    // -----------------------------------------------------------------
    //
    // SECURITY (SEC-01 / SEC-03):  start / end / downsample arrive over the
    // Socket.IO wire and TypeScript's `number?` annotations are not a
    // runtime guarantee.  A malicious or buggy client can send a string,
    // and historically those values were interpolated directly into a
    // `sql.raw` template — a textbook SQL-injection vector.
    //
    // As of SEC-03 (acarshub-backend/src/socket/schemas.ts → RRDTimeseriesSchema)
    // every field of `params` is validated by zod *before* this handler is
    // invoked: each field is asserted to be a finite integer in the bounds
    // chosen below.  By the time we reach this code, params.start /
    // params.end / params.downsample are guaranteed to be numbers (or
    // undefined) within those bounds, so we only need to enforce the
    // cross-field invariant `end > start` and apply defaults.
    //
    // Bounds (replicated from SEC-01 for the audit trail; authoritative
    // copies live in schemas.ts):
    //   * Unix seconds: 0 .. 4_102_444_800 (year 2100)
    //   * downsample:   60 .. 86_400 — at least one minute, at most one day
    const now = Math.floor(Date.now() / 1000);

    const start = params.start === undefined ? now - 86_400 : params.start;
    const end = params.end === undefined ? now : params.end;
    const downsample = params.downsample;

    // Cross-field invariant zod cannot express in a per-field schema.
    if (end <= start) {
      logger.warn("Rejected RRD timeseries explicit query (end <= start)", {
        socketId: socket.id,
        start,
        end,
      });

      socket.emit("rrd_timeseries_data", {
        error: "Invalid parameter: end must be greater than start",
        data: [],
        points: 0,
      });
      return;
    }

    logger.debug("RRD timeseries explicit query", {
      socketId: socket.id,
      start,
      end,
      downsample,
      rangeHours: Math.round((end - start) / 3600),
    });

    // Bucket step for 1-minute resolution (used when not downsampling)
    const minuteStep = 60;

    if (downsample && downsample > 60) {
      // Downsampled SQL path — bind every numeric value via the `sql` tagged
      // template so values travel as bound parameters, NOT raw text.
      const db = getDatabase();

      const results = db.all(
        sql`
          SELECT
            (timestamp / ${downsample}) * ${downsample} as bucket_timestamp,
            AVG(acars_count) as acars_count,
            AVG(vdlm_count) as vdlm_count,
            AVG(hfdl_count) as hfdl_count,
            AVG(imsl_count) as imsl_count,
            AVG(irdm_count) as irdm_count,
            AVG(total_count) as total_count,
            AVG(error_count) as error_count
          FROM timeseries_stats
          WHERE timestamp >= ${start}
            AND timestamp <= ${end}
          GROUP BY bucket_timestamp
          ORDER BY bucket_timestamp
        `,
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

      const rawRows = results.map((row) => ({
        timestamp: row.bucket_timestamp,
        acars: row.acars_count,
        vdlm: row.vdlm_count,
        hfdl: row.hfdl_count,
        imsl: row.imsl_count,
        irdm: row.irdm_count,
        total: row.total_count,
        error: row.error_count,
      }));

      const filledRows = zeroFillBuckets(rawRows, start, end, downsample);
      const formattedData = filledRows.map((row) => ({
        ...row,
        timestamp: row.timestamp * 1000,
      }));

      socket.emit("rrd_timeseries_data", {
        start: start * 1000,
        end: end * 1000,
        data: formattedData,
        downsample,
        points: formattedData.length,
      });

      logger.debug("RRD timeseries response (explicit downsampled)", {
        socketId: socket.id,
        points: formattedData.length,
      });
    } else {
      // 1-minute resolution path
      const data = await queryTimeseriesData("1min", start, end);

      const rawRows = data.map((row) => ({
        timestamp: row.timestamp,
        acars: row.acarsCount ?? 0,
        vdlm: row.vdlmCount ?? 0,
        hfdl: row.hfdlCount ?? 0,
        imsl: row.imslCount ?? 0,
        irdm: row.irdmCount ?? 0,
        total: row.totalCount ?? 0,
        error: row.errorCount ?? 0,
      }));

      const filledRows = zeroFillBuckets(rawRows, start, end, minuteStep);
      const formattedData = filledRows.map((row) => ({
        ...row,
        timestamp: row.timestamp * 1000,
      }));

      socket.emit("rrd_timeseries_data", {
        start: start * 1000,
        end: end * 1000,
        data: formattedData,
        points: formattedData.length,
      });

      logger.debug("RRD timeseries response (explicit 1-min)", {
        socketId: socket.id,
        points: formattedData.length,
      });
    }
  } catch (error) {
    logger.error("Failed to fetch RRD timeseries", {
      socketId: socket.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
