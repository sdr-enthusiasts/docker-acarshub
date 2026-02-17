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

import { getDatabase } from "../db/index.js";
import { timeseriesStats } from "../db/schema.js";
import { createLogger } from "../utils/logger.js";
import { getMessageQueue } from "./message-queue.js";

const logger = createLogger("stats-writer");

/**
 * Stats Writer Service
 *
 * Writes live message statistics to timeseries_stats table every minute.
 * This maintains continuity with the RRD migration by inserting fresh data points
 * with 1-minute resolution.
 *
 * Architecture:
 * 1. Aligns to minute boundaries (runs at :00 seconds)
 * 2. Reads current stats from MessageQueue
 * 3. Inserts row into timeseries_stats with resolution='1min'
 * 4. Calculates total messages (sum of all types)
 *
 * This replaces the Python RRD update functionality that wrote to acarshub.rrd every minute.
 */

let writeInterval: NodeJS.Timeout | null = null;

/**
 * Write current statistics to timeseries_stats table
 */
async function writeStats(): Promise<void> {
  try {
    const messageQueue = getMessageQueue();
    const stats = messageQueue.getStats();
    const timestamp = Math.floor(Date.now() / 1000); // Unix timestamp in seconds

    // Calculate total messages (excluding errors which are separate)
    const totalCount =
      stats.acars.lastMinute +
      stats.vdlm2.lastMinute +
      stats.hfdl.lastMinute +
      stats.imsl.lastMinute +
      stats.irdm.lastMinute;

    const db = getDatabase();
    await db.insert(timeseriesStats).values({
      timestamp,
      resolution: "1min",
      acarsCount: stats.acars.lastMinute,
      vdlmCount: stats.vdlm2.lastMinute,
      hfdlCount: stats.hfdl.lastMinute,
      imslCount: stats.imsl.lastMinute,
      irdmCount: stats.irdm.lastMinute,
      totalCount,
      errorCount: stats.error.lastMinute,
    });

    logger.debug("Stats written to timeseries", {
      timestamp,
      acars: stats.acars.lastMinute,
      vdlm: stats.vdlm2.lastMinute,
      hfdl: stats.hfdl.lastMinute,
      imsl: stats.imsl.lastMinute,
      irdm: stats.irdm.lastMinute,
      total: totalCount,
      errors: stats.error.lastMinute,
    });
  } catch (error) {
    logger.error("Failed to write stats to timeseries", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Start the stats writer task
 *
 * Aligns to minute boundaries (runs at :00 seconds) to match MessageQueue reset behavior.
 */
export function startStatsWriter(): void {
  if (writeInterval) {
    logger.warn("Stats writer already started");
    return;
  }

  // Calculate delay to next minute boundary
  const now = Date.now();
  const nextMinute = Math.ceil(now / 60000) * 60000;
  const delayToNextMinute = nextMinute - now;

  logger.info("Starting stats writer", {
    nextWriteIn: `${Math.round(delayToNextMinute / 1000)}s`,
  });

  // Schedule first write at next minute boundary
  setTimeout(() => {
    writeStats().catch((error) => {
      logger.error("Stats write failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    });

    // Then write every 60 seconds
    writeInterval = setInterval(() => {
      writeStats().catch((error) => {
        logger.error("Stats write failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }, 60000);

    logger.info("Stats writer started (interval: 60s)");
  }, delayToNextMinute);
}

/**
 * Stop the stats writer task
 */
export function stopStatsWriter(): void {
  if (writeInterval) {
    clearInterval(writeInterval);
    writeInterval = null;
    logger.info("Stats writer stopped");
  }
}

/**
 * Write stats immediately (for testing or manual trigger)
 */
export async function writeStatsNow(): Promise<void> {
  logger.info("Manual stats write triggered");
  await writeStats();
}
