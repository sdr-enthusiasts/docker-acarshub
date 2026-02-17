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

import { lt } from "drizzle-orm";
import { getDatabase } from "../db/index.js";
import { timeseriesStats } from "../db/schema.js";
import { createLogger } from "../utils/logger.js";
import type { Scheduler } from "./scheduler.js";

const logger = createLogger("stats-pruning");

/**
 * Default retention period in days
 * Can be overridden with TIMESERIES_RETENTION_DAYS environment variable
 */
const DEFAULT_RETENTION_DAYS = 1095; // 3 years

/**
 * Get retention period from environment or use default
 */
function getRetentionDays(): number {
  const envValue = process.env.TIMESERIES_RETENTION_DAYS;
  if (!envValue) {
    return DEFAULT_RETENTION_DAYS;
  }

  const parsed = Number.parseInt(envValue, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    logger.warn("Invalid TIMESERIES_RETENTION_DAYS value, using default", {
      value: envValue,
      default: DEFAULT_RETENTION_DAYS,
    });
    return DEFAULT_RETENTION_DAYS;
  }

  return parsed;
}

/**
 * Prune old time-series data
 *
 * Deletes data points older than the configured retention period.
 * All resolutions are pruned equally (though after migration, only 1min exists).
 */
export async function pruneOldStats(): Promise<void> {
  const retentionDays = getRetentionDays();
  const cutoffTimestamp = Math.floor(Date.now() / 1000) - retentionDays * 86400;
  const cutoffDate = new Date(cutoffTimestamp * 1000);

  logger.info("Starting stats pruning", {
    retentionDays,
    cutoffDate: cutoffDate.toISOString(),
  });

  try {
    const db = getDatabase();
    const result = db
      .delete(timeseriesStats)
      .where(lt(timeseriesStats.timestamp, cutoffTimestamp))
      .run();

    logger.info("Stats pruning complete", {
      deletedRows: result.changes,
      retentionDays,
    });

    // If we deleted a significant amount of data, run VACUUM to reclaim space
    if (result.changes > 10000) {
      logger.info("Running VACUUM to reclaim disk space", {
        deletedRows: result.changes,
      });
      db.run("VACUUM");
      logger.info("VACUUM complete");
    }
  } catch (error) {
    logger.error("Stats pruning failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Start automatic stats pruning
 *
 * Schedules pruning to run every 24 hours.
 * First run occurs at the next 3:00 AM (local time), then every 24 hours after.
 * This timing is chosen to minimize impact on active usage periods.
 *
 * @param scheduler - Scheduler instance
 */
export function startStatsPruning(scheduler: Scheduler): void {
  const retentionDays = getRetentionDays();

  logger.info("Starting stats pruning scheduler", {
    schedule: "every 24 hours",
    retentionDays,
  });

  // Schedule to run every 24 hours
  // Note: First run will be 24 hours from now
  // TODO: Consider calculating delay to next 3 AM for first run
  scheduler.every(24, "hours").do(async () => {
    await pruneOldStats();
  });
}
