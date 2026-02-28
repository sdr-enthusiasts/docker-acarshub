/**
 * RRD to SQLite Migration Service
 *
 * Migrates historical time-series data from RRD (Round Robin Database) to SQLite.
 * Runs as a blocking task during server startup, after database initialization.
 *
 * Architecture:
 * 1. Check for RRD file at configured path (default: /run/acars/acarshub.rrd)
 * 2. Check for .rrd.back file (indicates already migrated)
 * 3. Hash the candidate file and check the rrd_import_registry table —
 *    skips import if this exact file content was already imported before
 *    (guards against the user renaming .rrd.back back to .rrd)
 * 4. Fetch data from all 4 RRD archives using rrdtool CLI
 * 5. Parse rrdtool output (TSV format)
 * 6. Batch insert into timeseries_stats table (INSERT OR IGNORE — idempotent)
 * 7. Register the file hash in rrd_import_registry
 * 8. Rename RRD file to .rrd.back on success
 *
 * Duplicate protection is layered:
 *   - Hash registry: prevents re-import of the same file content entirely
 *   - INSERT OR IGNORE: silently skips rows that already exist in the DB
 *     (timestamp is the INTEGER PRIMARY KEY after migration 12)
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
import { createHash } from "node:crypto";
import { existsSync, readFileSync, renameSync, statSync } from "node:fs";
import { promisify } from "node:util";
import { count, eq } from "drizzle-orm";
import { getDatabase, getSqliteConnection } from "../db/index.js";
import { rrdImportRegistry, timeseriesStats } from "../db/schema.js";
import { createLogger } from "../utils/logger.js";

const execAsync = promisify(exec);
const logger = createLogger("rrd-migration");

/**
 * Time-series data point
 *
 * All data is stored at 1-minute resolution. The original multi-resolution
 * design was abandoned when the RRD importer was written to expand all coarser
 * archives into 1-minute buckets before inserting (see expandCoarseDataToOneMinute).
 */
interface TimeseriesDataPoint {
  timestamp: number;
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
 *
 * `timeRange` is the start time passed to `rrdtool fetch -s` and may be a
 * relative value (e.g. "-25h") or an absolute Unix timestamp string.
 * `endTime` is optional; when omitted it defaults to "now", which is correct
 * for production use. Tests override it to point at the fixture's actual data
 * window so fetches return real rows rather than empty time slots.
 *
 * `resolution` is kept here only for logging/debug context — it describes
 * the RRD archive step, not a DB column (the `resolution` column was removed
 * in migration 12).
 */
export interface RrdArchive {
  resolution: "1min" | "5min" | "1hour" | "6hour"; // for logging only
  timeRange: string; // start: relative (e.g., "-25h") or absolute Unix timestamp
  endTime?: string; // end: defaults to "now" when omitted
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
  const endTime = archive.endTime ?? "now";

  logger.debug("Fetching RRD archive", {
    resolution: archive.resolution,
    timeRange: archive.timeRange,
    endTime,
  });

  try {
    const { stdout } = await execAsync(
      `rrdtool fetch "${rrdPath}" AVERAGE -s ${archive.timeRange} -e ${endTime} -r ${archive.step}`,
      { maxBuffer: 50 * 1024 * 1024 },
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
  archiveResolution: "1min" | "5min" | "1hour" | "6hour",
): TimeseriesDataPoint[] {
  const lines = output.trim().split("\n");

  if (lines.length < 2) {
    logger.warn("Empty RRD output", { resolution: archiveResolution });
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
    resolution: archiveResolution,
    dataPoints: dataPoints.length,
  });

  return dataPoints;
}

/**
 * Expand coarse-grained RRD archive data into 1-minute buckets
 *
 * RRD archives store data at varying steps (5min, 1hour, 6hour). This function
 * expands each coarse point into N consecutive 1-minute rows so the entire
 * history ends up normalised to the same 1-minute granularity that the
 * live stats-writer uses.
 *
 * Example: A 5-minute data point with acars_count=25 becomes 5 one-minute rows,
 * each with acars_count=25 (the per-minute average over that period).
 *
 * After migration 12 there is no `resolution` column in the DB; the
 * `archiveResolution` field on TimeseriesDataPoint is used only here, locally,
 * to determine how many 1-minute sub-rows to emit.
 *
 * @param dataPoints - Data points annotated with their source archive resolution
 * @returns Expanded data points, all at 1-minute granularity
 */
function expandCoarseDataToOneMinute(
  dataPoints: Array<TimeseriesDataPoint & { archiveResolution: "1min" | "5min" | "1hour" | "6hour" }>,
): TimeseriesDataPoint[] {
  const expanded: TimeseriesDataPoint[] = [];

  for (const point of dataPoints) {
    // 1-minute data: keep as-is
    if (point.archiveResolution === "1min") {
      const { archiveResolution: _r, ...rest } = point;
      expanded.push(rest);
      continue;
    }

    // Calculate how many 1-minute intervals this point represents
    let intervalCount: number;
    let intervalSeconds: number;

    switch (point.archiveResolution) {
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
        logger.warn("Unknown archive resolution, skipping", {
          archiveResolution: point.archiveResolution,
        });
        continue;
    }

    // Create multiple 1-minute rows spanning the time period
    for (let i = 0; i < intervalCount; i++) {
      expanded.push({
        timestamp: point.timestamp + i * intervalSeconds,
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

// ============================================================================
// RRD Import Registry helpers
// ============================================================================

/**
 * Ensure the rrd_import_registry table exists.
 *
 * Migration 11 creates this table, but we guard with CREATE TABLE IF NOT EXISTS
 * so calls made before migrations run (e.g. in tests that skip migrations) are
 * safe.  Uses the raw SQLite connection because Drizzle requires the table to
 * exist in the schema before it can query it.
 *
 * Wrapped in try-catch throughout the call-sites — registry operations are
 * best-effort and must never abort a migration that would otherwise succeed.
 */
function ensureRegistryTable(): void {
  const conn = getSqliteConnection();
  conn.exec(`
    CREATE TABLE IF NOT EXISTS rrd_import_registry (
      id            INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      file_hash     TEXT    NOT NULL UNIQUE,
      rrd_path      TEXT    NOT NULL,
      imported_at   INTEGER NOT NULL,
      rows_imported INTEGER NOT NULL DEFAULT 0
    )
  `);
  conn.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_rrd_import_registry_hash
    ON rrd_import_registry (file_hash)
  `);
}

/**
 * Compute the SHA-256 hash of a file's byte content.
 *
 * RRD files are fixed-size (bounded by their round-robin design, typically a
 * few MB), so reading the entire file into memory is safe and fast.
 *
 * @param filePath - Absolute path to the file
 * @returns Lowercase hex SHA-256 digest
 */
function computeFileHash(filePath: string): string {
  const content = readFileSync(filePath);
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Check whether a file hash is already recorded in the import registry.
 *
 * @param fileHash - SHA-256 hex string
 * @returns true if the hash exists in the registry
 */
function isHashRegistered(fileHash: string): boolean {
  const db = getDatabase();
  const row = db
    .select({ fileHash: rrdImportRegistry.fileHash })
    .from(rrdImportRegistry)
    .where(eq(rrdImportRegistry.fileHash, fileHash))
    .get();
  return row !== undefined;
}

/**
 * Record a file hash in the import registry.
 *
 * Uses INSERT OR REPLACE (onConflictDoUpdate) so it is safe to call even
 * if the hash is already registered (e.g. during the silent-fail re-migration
 * recovery path).
 *
 * @param fileHash     - SHA-256 hex string
 * @param rrdPath      - Path to the file at import time
 * @param rowsImported - Number of rows inserted into timeseries_stats
 */
function registerHash(
  fileHash: string,
  rrdPath: string,
  rowsImported: number,
): void {
  const db = getDatabase();
  db.insert(rrdImportRegistry)
    .values({
      fileHash,
      rrdPath,
      importedAt: Date.now(),
      rowsImported,
    })
    .onConflictDoUpdate({
      target: rrdImportRegistry.fileHash,
      set: {
        rrdPath,
        importedAt: Date.now(),
        rowsImported,
      },
    })
    .run();
}

/**
 * Best-effort: register the hash of an existing .rrd.back file.
 *
 * WHY THIS EXISTS
 * ---------------
 * Deployments that ran the RRD importer before the hash registry existed will
 * have a .rrd.back file but nothing in rrd_import_registry.  On the very first
 * startup after the registry feature is deployed, this function records the
 * hash of the backup file so that if the user later renames .rrd.back → .rrd,
 * the hash check will catch it and skip the duplicate import.
 *
 * This is called from the "backup exists + DB has rows → already migrated"
 * code path.  If anything fails (file unreadable, DB not ready), it logs at
 * debug level and returns — it must not abort the skip-migration fast path.
 *
 * @param backupPath - Path to the .rrd.back file
 */
function tryRegisterBackupHash(backupPath: string): void {
  try {
    ensureRegistryTable();

    const fileHash = computeFileHash(backupPath);

    if (isHashRegistered(fileHash)) {
      // Already registered from a previous startup — nothing to do.
      return;
    }

    registerHash(fileHash, backupPath, 0 /* rows unknown for legacy imports */);

    logger.info(
      "Registered hash of existing .rrd.back file (graceful degradation for pre-registry deployment)",
      { backupPath, fileHash },
    );
  } catch (error) {
    logger.debug(
      "Could not register .rrd.back hash — non-fatal, registry is best-effort",
      { backupPath, error: error instanceof Error ? error.message : String(error) },
    );
  }
}

// ============================================================================

/**
 * Batch insert data points into database
 *
 * Uses synchronous .run() — required for better-sqlite3. Drizzle insert
 * chains without .run() are silent no-ops with this driver (the statement
 * is built but never sent to SQLite). See stats-writer.ts for the same note.
 *
 * Each batch is wrapped in a transaction so that partial failures don't
 * leave orphaned rows and so SQLite can flush once per batch rather than
 * once per row.
 *
 * Uses onConflictDoNothing() so the insert is idempotent: if a row for the
 * same timestamp already exists (timestamp is the INTEGER PRIMARY KEY after
 * migration 12), it is silently skipped rather than causing an error or
 * creating a duplicate.
 *
 * @param dataPoints - Data points to insert
 * @param batchSize - Number of rows per batch (default: 100)
 */
function batchInsertDataPoints(
  dataPoints: TimeseriesDataPoint[],
  batchSize = 100,
): void {
  logger.info("Starting batch insert", {
    totalPoints: dataPoints.length,
    batchSize,
  });

  const db = getDatabase();
  let insertedCount = 0;

  for (let i = 0; i < dataPoints.length; i += batchSize) {
    const batch = dataPoints.slice(i, i + batchSize);

    try {
      // .run() is required — without it Drizzle never executes the insert.
      // onConflictDoNothing() makes the insert idempotent: rows that already
      // exist for the same timestamp (INTEGER PRIMARY KEY) are silently skipped.
      db.insert(timeseriesStats)
        .values(
          batch.map((point) => ({
            timestamp: point.timestamp,
            acarsCount: point.acarsCount,
            vdlmCount: point.vdlmCount,
            hfdlCount: point.hfdlCount,
            imslCount: point.imslCount,
            irdmCount: point.irdmCount,
            totalCount: point.totalCount,
            errorCount: point.errorCount,
          })),
        )
        .onConflictDoNothing()
        .run();

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
/**
 * Migrate RRD data to SQLite
 *
 * Main migration function that orchestrates the entire process.
 * - Checks for RRD file and backup file
 * - Fetches data from all 4 RRD archives using rrdtool CLI
 * - Inserts data into database in batches
 * - Renames RRD file to .rrd.back on success
 *
 * @param rrdPath - Path to RRD file (default from config)
 * @param archiveConfig - Optional archive definitions. Defaults to the four
 *   production archives (`RRD_ARCHIVES`). Tests pass compact absolute-timestamp
 *   overrides so they only fetch the small slice of the fixture that contains
 *   real data, keeping migration time well under 5 seconds.
 * @returns Migration statistics or null if already migrated/no file
 */
export async function migrateRrdToSqlite(
  rrdPath: string,
  archiveConfig?: RrdArchive[],
): Promise<{
  success: boolean;
  rowsInserted: number;
  duration: number;
} | null> {
  const archives = archiveConfig ?? RRD_ARCHIVES;
  const startTime = Date.now();

  logger.info("Starting RRD migration", { rrdPath });

  // 1. Check if already migrated via the .back sentinel file.
  const backupPath = `${rrdPath}.back`;
  if (existsSync(backupPath)) {
    // Verify the migration actually wrote data.  A previous version of this
    // code used `await db.insert().values()` without `.run()`, which is a
    // silent no-op with better-sqlite3.  The backup file was still created,
    // so on the next startup the migration appeared "done" even though zero
    // rows were ever inserted.  Detect that case and re-migrate.
    const db = getDatabase();
    const countResult = db
      .select({ count: count() })
      .from(timeseriesStats)
      .get();
    const rowCount = countResult?.count ?? 0;

    if (rowCount > 0) {
      logger.info("RRD already migrated (backup file exists)", {
        backupPath,
        existingRows: rowCount,
      });

      // Best-effort: record the backup file's hash so that if the user
      // renames .rrd.back → .rrd on a future startup, the hash check below
      // will catch it and skip the duplicate import.  This is the one-time
      // graceful-degradation path for deployments that pre-date the registry.
      tryRegisterBackupHash(backupPath);

      return null;
    }

    logger.warn(
      "RRD backup exists but timeseries_stats is empty — previous migration " +
        "silently failed (missing .run()). Re-migrating from backup file.",
      { backupPath, rrdPath },
    );

    // Restore the backup so the normal migration path can read it.
    try {
      renameSync(backupPath, rrdPath);
      logger.info("Restored backup file for re-migration", {
        from: backupPath,
        to: rrdPath,
      });
    } catch (error) {
      logger.error(
        "Failed to restore backup file for re-migration — skipping",
        {
          backupPath,
          error: error instanceof Error ? error.message : String(error),
        },
      );
      return null;
    }
    // Fall through to the normal migration logic below.
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

  // 4. Hash-based registry check.
  //
  //    WHY: the .back sentinel above only protects the normal post-migration
  //    state.  If a user renames .rrd.back → .rrd the sentinel is gone and
  //    we would re-import every row, doubling historical data.  The registry
  //    records the SHA-256 of every file we have successfully imported, so
  //    the same byte-for-byte content is never imported twice regardless of
  //    what the file is named.
  //
  //    Wrapped in try-catch: registry operations are best-effort.  If the
  //    table is not yet available (e.g. migration 11 hasn't run yet on a
  //    very old deployment), we log at debug level and proceed without the
  //    guard — the idempotent INSERT OR IGNORE in step 6 still prevents
  //    duplicate rows at the DB level.
  let fileHash: string | null = null;
  try {
    ensureRegistryTable();
    fileHash = computeFileHash(rrdPath);

    if (isHashRegistered(fileHash)) {
      logger.warn(
        "RRD file content matches a previously imported file — skipping " +
          "(regression guard: file was likely renamed from .rrd.back)",
        { rrdPath, fileHash },
      );

      // Re-create the .back sentinel so future startups take the fast path.
      try {
        renameSync(rrdPath, backupPath);
        logger.info("Renamed previously-imported RRD back to .back", {
          from: rrdPath,
          to: backupPath,
        });
      } catch (renameError) {
        logger.warn(
          "Could not rename previously-imported RRD back to .back — non-fatal",
          {
            error:
              renameError instanceof Error
                ? renameError.message
                : String(renameError),
          },
        );
      }

      return null;
    }
  } catch (registryError) {
    logger.debug(
      "Registry check unavailable — proceeding without hash guard " +
        "(INSERT OR IGNORE in the insert step still prevents duplicate rows)",
      {
        error:
          registryError instanceof Error
            ? registryError.message
            : String(registryError),
      },
    );
  }

  try {
    // 5. Fetch data from all archives
    logger.info("Fetching data from RRD archives");
    const allDataPoints: Array<TimeseriesDataPoint & { archiveResolution: "1min" | "5min" | "1hour" | "6hour" }> = [];

    for (const archive of archives) {
      try {
        const dataPoints = await fetchRrdArchive(rrdPath, archive);
        // Tag each point with its source archive resolution so
        // expandCoarseDataToOneMinute knows how many sub-rows to emit.
        allDataPoints.push(
          ...dataPoints.map((p) => ({
            ...p,
            archiveResolution: archive.resolution,
          })),
        );

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
        "1min": allDataPoints.filter((p) => p.archiveResolution === "1min").length,
        "5min": allDataPoints.filter((p) => p.archiveResolution === "5min").length,
        "1hour": allDataPoints.filter((p) => p.archiveResolution === "1hour").length,
        "6hour": allDataPoints.filter((p) => p.archiveResolution === "6hour").length,
      },
    });

    // 6. Expand coarse-grained data to 1-minute resolution
    logger.info("Expanding coarse data to 1-minute resolution");
    const expandedDataPoints = expandCoarseDataToOneMinute(allDataPoints);

    // 7. Insert data into database (idempotent: INSERT OR IGNORE)
    batchInsertDataPoints(expandedDataPoints);

    // 8. Record the file hash in the registry so future imports of the same
    //    content are skipped immediately, regardless of filename.
    if (fileHash !== null) {
      try {
        registerHash(fileHash, rrdPath, expandedDataPoints.length);
        logger.info("Registered import hash in registry", { fileHash });
      } catch (hashError) {
        // Non-fatal — the migration itself succeeded; only the registry
        // update failed.  Log and continue so the .back rename still happens.
        logger.warn("Failed to register import hash — non-fatal", {
          error:
            hashError instanceof Error
              ? hashError.message
              : String(hashError),
        });
      }
    }

    // 9. Rename RRD file to .back (belt-and-suspenders sentinel for fast
    //    path on subsequent startups)
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
 * Query time-series data by time range
 *
 * All data is at 1-minute resolution after migration 12 (the `resolution`
 * column was removed). The `_resolution` parameter is accepted but ignored
 * so that callers do not need to be updated.
 *
 * @param _resolution - Ignored (kept for call-site compatibility)
 * @param startTime - Start timestamp (Unix seconds)
 * @param endTime - End timestamp (Unix seconds)
 * @returns Array of time-series data points
 */
export async function queryTimeseriesData(
  _resolution: "1min" | "5min" | "1hour" | "6hour",
  startTime: number,
  endTime: number,
): Promise<TimeseriesDataPoint[]> {
  const db = getDatabase();
  const { and, gte, lte } = await import("drizzle-orm");

  const results = await db
    .select()
    .from(timeseriesStats)
    .where(
      and(
        gte(timeseriesStats.timestamp, startTime),
        lte(timeseriesStats.timestamp, endTime),
      ),
    )
    .orderBy(timeseriesStats.timestamp);

  return results.map((row) => ({
    timestamp: row.timestamp,
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
 * The `_resolution` parameter is accepted but ignored — all data is at
 * 1-minute granularity after migration 12.
 *
 * @param _resolution - Ignored (kept for call-site compatibility)
 * @returns Latest data point or null
 */
export async function getLatestTimeseriesData(
  _resolution: "1min" | "5min" | "1hour" | "6hour" = "1min",
): Promise<TimeseriesDataPoint | null> {
  const db = getDatabase();
  const { desc } = await import("drizzle-orm");

  const results = await db
    .select()
    .from(timeseriesStats)
    .orderBy(desc(timeseriesStats.timestamp))
    .limit(1);

  if (results.length === 0) {
    return null;
  }

  const row = results[0];
  return {
    timestamp: row.timestamp,
    acarsCount: row.acarsCount,
    vdlmCount: row.vdlmCount,
    hfdlCount: row.hfdlCount,
    imslCount: row.imslCount,
    irdmCount: row.irdmCount,
    totalCount: row.totalCount,
    errorCount: row.errorCount,
  };
}
