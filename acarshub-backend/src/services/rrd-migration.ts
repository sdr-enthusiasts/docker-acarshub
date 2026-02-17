/**
 * RRD to SQLite Migration Service
 *
 * Migrates historical time-series data from RRD (Round Robin Database) to SQLite.
 * Runs as a blocking task during server startup, after database initialization.
 *
 * Architecture:
 * 1. Check for RRD file at configured path (default: /run/acars/acarshub.rrd)
 * 2. Check for .rrd.back file (indicates already migrated)
 * 3. Fetch data from all 4 RRD archives using rrdtool CLI
 * 4. Parse rrdtool output (TSV format)
 * 5. Batch insert into timeseries_stats table
 * 6. Rename RRD file to .rrd.back on success
 *
 * RRD Structure:
 * - Data Sources: ACARS, VDLM, TOTAL, ERROR, HFDL, IMSL, IRDM
 * - Archives:
 *   - RRA 0: 1-minute resolution, 1500 points (25 hours)
 *   - RRA 1: 5-minute resolution, 8640 points (1 month)
 *   - RRA 2: 1-hour resolution, 4320 points (6 months)
 *   - RRA 3: 6-hour resolution, 4380 points (3 years)
 */

import { exec } from "node:child_process";
import { existsSync, renameSync, statSync } from "node:fs";
import { promisify } from "node:util";
import { getDatabase } from "../db/index.js";
import { timeseriesStats } from "../db/schema.js";
import { createLogger } from "../utils/logger.js";

const execAsync = promisify(exec);
const logger = createLogger("rrd-migration");

/**
 * Time-series data point from RRD
 */
interface TimeseriesDataPoint {
  timestamp: number;
  resolution: "1min" | "5min" | "1hour" | "6hour";
  acarsCount: number;
  vdlmCount: number;
  hfdlCount: number;
  imslCount: number;
  irdmCount: number;
  totalCount: number;
  errorCount: number;
}

/**
 * RRD archive configuration
 */
interface RrdArchive {
  resolution: "1min" | "5min" | "1hour" | "6hour";
  timeRange: string; // e.g., "-25h", "-30d", "-180d", "-3y"
  step: number; // seconds per data point
}

const RRD_ARCHIVES: RrdArchive[] = [
  { resolution: "1min", timeRange: "-25h", step: 60 },
  { resolution: "5min", timeRange: "-30d", step: 300 },
  { resolution: "1hour", timeRange: "-180d", step: 3600 },
  { resolution: "6hour", timeRange: "-3y", step: 21600 },
];

/**
 * Fetch data from a single RRD archive
 *
 * @param rrdPath - Path to RRD file
 * @param archive - Archive configuration
 * @returns Array of data points
 */
async function fetchRrdArchive(
  rrdPath: string,
  archive: RrdArchive,
): Promise<TimeseriesDataPoint[]> {
  logger.debug("Fetching RRD archive", {
    resolution: archive.resolution,
    timeRange: archive.timeRange,
  });

  try {
    const { stdout } = await execAsync(
      `rrdtool fetch "${rrdPath}" AVERAGE -s ${archive.timeRange} -e now -r ${archive.step}`,
    );

    return parseRrdOutput(stdout, archive.resolution);
  } catch (error) {
    logger.error("Failed to fetch RRD archive", {
      resolution: archive.resolution,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Parse rrdtool fetch output
 *
 * Output format:
 * ```
 * ACARS                VDLM               TOTAL               ERROR                HFDL                IMSL                IRDM
 *
 * 1771282260: 9.9723720000e-01 2.4930930000e+01 3.3906064800e+01 0.0000000000e+00 7.9778976000e+00 0.0000000000e+00 0.0000000000e+00
 * 1771282320: -nan -nan -nan -nan -nan -nan -nan
 * ```
 *
 * @param output - rrdtool fetch output
 * @param resolution - Time resolution
 * @returns Parsed data points (NaN values converted to 0)
 */
function parseRrdOutput(
  output: string,
  resolution: "1min" | "5min" | "1hour" | "6hour",
): TimeseriesDataPoint[] {
  const lines = output.trim().split("\n");

  if (lines.length < 2) {
    logger.warn("Empty RRD output", { resolution });
    return [];
  }

  // First line is headers, second line is blank, data starts at line 3
  const dataLines = lines.slice(2);
  const dataPoints: TimeseriesDataPoint[] = [];

  for (const line of dataLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Match: "1771282260: 9.97e-01 2.49e+01 3.39e+01 0.00e+00 7.97e+00 0.00e+00 0.00e+00"
    // Or: "1771282320: -nan -nan -nan -nan -nan -nan -nan"
    const match = trimmed.match(/^(\d+):\s+([\d.e+\-nan\s]+)$/);

    if (!match) {
      logger.debug("Skipping malformed line", { line: trimmed });
      continue;
    }

    const timestamp = Number.parseInt(match[1], 10);
    const values = match[2]
      .trim()
      .split(/\s+/)
      .map((v) => {
        if (v === "-nan" || v === "nan") return 0;
        const parsed = Number.parseFloat(v);
        return Number.isNaN(parsed) ? 0 : Math.round(parsed); // Round to integer
      });

    if (values.length !== 7) {
      logger.debug("Skipping line with incorrect value count", {
        expected: 7,
        actual: values.length,
        line: trimmed,
      });
      continue;
    }

    dataPoints.push({
      timestamp,
      resolution,
      acarsCount: values[0],
      vdlmCount: values[1],
      totalCount: values[2],
      errorCount: values[3],
      hfdlCount: values[4],
      imslCount: values[5],
      irdmCount: values[6],
    });
  }

  logger.debug("Parsed RRD data", {
    resolution,
    dataPoints: dataPoints.length,
  });

  return dataPoints;
}

/**
 * Expand coarse-grained data into 1-minute resolution
 *
 * Takes data points from coarser resolutions (5min, 1hour, 6hour) and expands
 * them into multiple 1-minute data points. This preserves historical data while
 * normalizing everything to a single resolution.
 *
 * Example: A 5-minute data point with acars_count=25 becomes 5 one-minute rows,
 * each with acars_count=25 (the average over that period).
 *
 * @param dataPoints - Data points to expand
 * @returns Expanded data points at 1-minute resolution
 */
function expandCoarseDataToOneMinute(
  dataPoints: TimeseriesDataPoint[],
): TimeseriesDataPoint[] {
  const expanded: TimeseriesDataPoint[] = [];

  for (const point of dataPoints) {
    // 1-minute data: keep as-is
    if (point.resolution === "1min") {
      expanded.push(point);
      continue;
    }

    // Calculate how many 1-minute intervals this point represents
    let intervalCount: number;
    let intervalSeconds: number;

    switch (point.resolution) {
      case "5min":
        intervalCount = 5;
        intervalSeconds = 60;
        break;
      case "1hour":
        intervalCount = 60;
        intervalSeconds = 60;
        break;
      case "6hour":
        intervalCount = 360;
        intervalSeconds = 60;
        break;
      default:
        logger.warn("Unknown resolution, skipping", {
          resolution: point.resolution,
        });
        continue;
    }

    // Create multiple 1-minute rows spanning the time period
    for (let i = 0; i < intervalCount; i++) {
      expanded.push({
        timestamp: point.timestamp + i * intervalSeconds,
        resolution: "1min",
        acarsCount: point.acarsCount,
        vdlmCount: point.vdlmCount,
        hfdlCount: point.hfdlCount,
        imslCount: point.imslCount,
        irdmCount: point.irdmCount,
        totalCount: point.totalCount,
        errorCount: point.errorCount,
      });
    }
  }

  logger.info("Expanded coarse data to 1-minute resolution", {
    original: dataPoints.length,
    expanded: expanded.length,
  });

  return expanded;
}

/**
 * Batch insert data points into database
 *
 * @param dataPoints - Data points to insert
 * @param batchSize - Number of rows per batch (default: 500)
 */
async function batchInsertDataPoints(
  dataPoints: TimeseriesDataPoint[],
  batchSize = 500,
): Promise<void> {
  logger.info("Starting batch insert", {
    totalPoints: dataPoints.length,
    batchSize,
  });

  let insertedCount = 0;

  for (let i = 0; i < dataPoints.length; i += batchSize) {
    const batch = dataPoints.slice(i, i + batchSize);

    try {
      const db = getDatabase();
      await db.insert(timeseriesStats).values(
        batch.map((point) => ({
          timestamp: point.timestamp,
          resolution: point.resolution,
          acarsCount: point.acarsCount,
          vdlmCount: point.vdlmCount,
          hfdlCount: point.hfdlCount,
          imslCount: point.imslCount,
          irdmCount: point.irdmCount,
          totalCount: point.totalCount,
          errorCount: point.errorCount,
        })),
      );

      insertedCount += batch.length;

      if (insertedCount % 5000 === 0 || insertedCount === dataPoints.length) {
        logger.debug("Batch insert progress", {
          inserted: insertedCount,
          total: dataPoints.length,
          percent: Math.round((insertedCount / dataPoints.length) * 100),
        });
      }
    } catch (error) {
      logger.error("Batch insert failed", {
        batchStart: i,
        batchSize: batch.length,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  logger.info("Batch insert complete", { insertedCount });
}

/**
 * Check if RRD file is valid and readable
 *
 * @param rrdPath - Path to RRD file
 * @returns true if valid, false otherwise
 */
function isValidRrdFile(rrdPath: string): boolean {
  try {
    if (!existsSync(rrdPath)) {
      return false;
    }

    const stats = statSync(rrdPath);
    if (!stats.isFile()) {
      logger.warn("RRD path is not a file", { rrdPath });
      return false;
    }

    if (stats.size === 0) {
      logger.warn("RRD file is empty", { rrdPath });
      return false;
    }

    return true;
  } catch (error) {
    logger.error("Failed to check RRD file", {
      rrdPath,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Migrate RRD data to SQLite
 *
 * Main migration function that orchestrates the entire process.
 * - Checks for RRD file and backup file
 * - Fetches data from all archives
 * - Inserts data into database in batches
 * - Renames RRD file on success
 *
 * @param rrdPath - Path to RRD file (default from config)
 * @returns Migration statistics or null if already migrated/no file
 */
export async function migrateRrdToSqlite(rrdPath: string): Promise<{
  success: boolean;
  rowsInserted: number;
  duration: number;
} | null> {
  const startTime = Date.now();

  logger.info("Starting RRD migration", { rrdPath });

  // 1. Check if already migrated
  const backupPath = `${rrdPath}.back`;
  if (existsSync(backupPath)) {
    logger.info("RRD already migrated (backup file exists)", { backupPath });
    return null;
  }

  // 2. Check if RRD file exists
  if (!existsSync(rrdPath)) {
    logger.info("No RRD file found, skipping migration", { rrdPath });
    return null;
  }

  // 3. Validate RRD file
  if (!isValidRrdFile(rrdPath)) {
    logger.error("Invalid RRD file, cannot migrate", { rrdPath });
    // Rename to .corrupt so we don't keep trying
    try {
      renameSync(rrdPath, `${rrdPath}.corrupt`);
      logger.warn("Renamed corrupt RRD file", {
        from: rrdPath,
        to: `${rrdPath}.corrupt`,
      });
    } catch (error) {
      logger.error("Failed to rename corrupt RRD file", { error });
    }
    return {
      success: false,
      rowsInserted: 0,
      duration: Date.now() - startTime,
    };
  }

  try {
    // 4. Fetch data from all archives
    logger.info("Fetching data from RRD archives");
    const allDataPoints: TimeseriesDataPoint[] = [];

    for (const archive of RRD_ARCHIVES) {
      try {
        const dataPoints = await fetchRrdArchive(rrdPath, archive);
        allDataPoints.push(...dataPoints);

        logger.info("Fetched RRD archive", {
          resolution: archive.resolution,
          points: dataPoints.length,
        });
      } catch (error) {
        logger.error("Failed to fetch archive, continuing with others", {
          resolution: archive.resolution,
          error: error instanceof Error ? error.message : String(error),
        });
        // Continue with other archives even if one fails
      }
    }

    if (allDataPoints.length === 0) {
      logger.warn("No data points fetched from RRD, skipping migration");
      return {
        success: false,
        rowsInserted: 0,
        duration: Date.now() - startTime,
      };
    }

    logger.info("Total data points fetched", {
      total: allDataPoints.length,
      byResolution: {
        "1min": allDataPoints.filter((p) => p.resolution === "1min").length,
        "5min": allDataPoints.filter((p) => p.resolution === "5min").length,
        "1hour": allDataPoints.filter((p) => p.resolution === "1hour").length,
        "6hour": allDataPoints.filter((p) => p.resolution === "6hour").length,
      },
    });

    // 5. Expand coarse-grained data to 1-minute resolution
    logger.info("Expanding coarse data to 1-minute resolution");
    const expandedDataPoints = expandCoarseDataToOneMinute(allDataPoints);

    // 6. Insert data into database
    await batchInsertDataPoints(expandedDataPoints);

    // 7. Rename RRD file to .back (indicates successful migration)
    try {
      renameSync(rrdPath, backupPath);
      logger.info("Renamed RRD file to backup", {
        from: rrdPath,
        to: backupPath,
      });
    } catch (error) {
      logger.error("Failed to rename RRD file", {
        error: error instanceof Error ? error.message : String(error),
      });
      // Don't fail the migration if rename fails
    }

    const duration = Date.now() - startTime;

    logger.info("RRD migration complete", {
      success: true,
      rowsInserted: expandedDataPoints.length,
      duration,
    });

    return {
      success: true,
      rowsInserted: expandedDataPoints.length,
      duration,
    };
  } catch (error) {
    logger.error("RRD migration failed", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return {
      success: false,
      rowsInserted: 0,
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Query time-series data by resolution and time range
 *
 * @param resolution - Time resolution to query
 * @param startTime - Start timestamp (Unix seconds)
 * @param endTime - End timestamp (Unix seconds)
 * @returns Array of time-series data points
 */
export async function queryTimeseriesData(
  resolution: "1min" | "5min" | "1hour" | "6hour",
  startTime: number,
  endTime: number,
): Promise<TimeseriesDataPoint[]> {
  const db = getDatabase();
  const { eq, and, gte, lte } = await import("drizzle-orm");

  const results = await db
    .select()
    .from(timeseriesStats)
    .where(
      and(
        eq(timeseriesStats.resolution, resolution),
        gte(timeseriesStats.timestamp, startTime),
        lte(timeseriesStats.timestamp, endTime),
      ),
    )
    .orderBy(timeseriesStats.timestamp);

  return results.map((row) => ({
    timestamp: row.timestamp,
    resolution: row.resolution as "1min" | "5min" | "1hour" | "6hour",
    acarsCount: row.acarsCount,
    vdlmCount: row.vdlmCount,
    hfdlCount: row.hfdlCount,
    imslCount: row.imslCount,
    irdmCount: row.irdmCount,
    totalCount: row.totalCount,
    errorCount: row.errorCount,
  }));
}

/**
 * Get latest time-series data point (for Prometheus metrics)
 *
 * @param resolution - Resolution to query (default: 1min)
 * @returns Latest data point or null
 */
export async function getLatestTimeseriesData(
  resolution: "1min" | "5min" | "1hour" | "6hour" = "1min",
): Promise<TimeseriesDataPoint | null> {
  const db = getDatabase();
  const { eq, desc } = await import("drizzle-orm");

  const results = await db
    .select()
    .from(timeseriesStats)
    .where(eq(timeseriesStats.resolution, resolution))
    .orderBy(desc(timeseriesStats.timestamp))
    .limit(1);

  if (results.length === 0) {
    return null;
  }

  const row = results[0];
  return {
    timestamp: row.timestamp,
    resolution: row.resolution as "1min" | "5min" | "1hour" | "6hour",
    acarsCount: row.acarsCount,
    vdlmCount: row.vdlmCount,
    hfdlCount: row.hfdlCount,
    imslCount: row.imslCount,
    irdmCount: row.irdmCount,
    totalCount: row.totalCount,
    errorCount: row.errorCount,
  };
}
