/**
 * RRD to SQLite Migration Service
 *
 * Migrates historical time-series data from RRD (Round Robin Database) to SQLite.
 * Runs as a blocking task during server startup, after database initialization.
 *
 * Sentinel strategy — single backup file + registry discriminator:
 *
 *   Both old and new importers leave the source file at `acarshub.rrd.back`
 *   after completion.  The `rrd_import_registry.rrd_path` column records the
 *   path FROM WHICH the file was imported and is the sole discriminator:
 *
 *   rrd_path ends with ".back"
 *     → file was imported by the OLD (buggy) importer, which renamed .rrd →
 *       .back BEFORE importing and then registered under that .back path.
 *       Repair path: delete bad rows, clear registry, rename .back → .rrd,
 *       re-import with fixed code, rename .rrd → .back.
 *
 *   rrd_path does NOT end with ".back"
 *     → file was imported by the FIXED importer (rrd_path = "acarshub.rrd").
 *       Skip — data is already correct.
 *
 *   No registry entry for the .back file's hash
 *     → unknown / pre-registry deployment; treat as fresh: rename .back → .rrd
 *       and proceed with a normal import.
 *
 * Architecture (fresh import path):
 * 1. Check .rrd.back  → consult registry rrd_path to decide: skip, repair, or
 *                       fresh import (rename .back → .rrd and fall through)
 * 2. Check .rrd       → validate + hash check
 * 3. Fetch data from all 4 RRD archives using rrdtool CLI
 * 4. Parse rrdtool output (TSV format) — all-NaN rows skipped
 * 5. Expand coarse archives backward to 1-minute resolution
 * 6. Clamp any rows beyond Date.now()
 * 7. Batch insert into timeseries_stats (INSERT OR IGNORE — idempotent)
 * 8. Register the file hash in rrd_import_registry with rrd_path = "acarshub.rrd"
 * 9. Rename RRD file to .rrd.back
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
import { and, count, eq, gt, lte } from "drizzle-orm";
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
 * Rows where every data column is `-nan` or `nan` are silently skipped — they
 * represent time slots where the RRD had no source data (e.g. the period
 * between the RRD's last_update and the current time).  Inserting zero-valued
 * rows for these slots would pollute the database with false zeros and can
 * pre-occupy future timestamps that the live stats-writer should own.
 *
 * Rows where only some columns are NaN (partial NaN) keep the non-NaN values
 * and map the NaN columns to 0.
 *
 * @param output - rrdtool fetch output
 * @param resolution - Time resolution
 * @returns Parsed data points (all-NaN rows skipped; partial-NaN columns → 0)
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
    const rawTokens = match[2].trim().split(/\s+/);

    if (rawTokens.length !== 7) {
      logger.debug("Skipping line with incorrect value count", {
        expected: 7,
        actual: rawTokens.length,
        line: trimmed,
      });
      continue;
    }

    // Skip rows where every column is NaN — these represent time slots with
    // no source data (e.g. the gap between RRD last_update and "now").
    // Inserting zero-count rows for these slots pollutes the DB with false
    // zeros and pre-occupies future timestamps that the live stats-writer owns.
    const allNaN = rawTokens.every((v) => v === "-nan" || v === "nan");
    if (allNaN) {
      logger.debug("Skipping all-NaN row", { timestamp });
      continue;
    }

    const values = rawTokens.map((v) => {
      if (v === "-nan" || v === "nan") return 0; // partial NaN → 0
      const parsed = Number.parseFloat(v);
      return Number.isNaN(parsed) ? 0 : Math.round(parsed);
    });

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

    // rrdtool returns the timestamp at the END of each consolidation period.
    // For a 5-minute point at T the period covered is [T-300, T], and the five
    // 1-minute sub-periods ending within it are at T-240, T-180, T-120, T-60, T.
    //
    // We therefore expand BACKWARD from T so each sub-row sits at the correct
    // historical timestamp.  The formula for sub-row i (0 = earliest, N-1 = T):
    //
    //   sub_timestamp = T - (intervalCount - 1 - i) * 60
    //
    // Previously the code expanded FORWARD (T, T+60, T+120, …), which shifted
    // all historical data into the future and created rows far beyond the RRD's
    // last_update — a regression that pre-occupied future timestamps belonging
    // to the live stats-writer.
    for (let i = 0; i < intervalCount; i++) {
      expanded.push({
        timestamp: point.timestamp - (intervalCount - 1 - i) * intervalSeconds,
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
 * Return true if the given registry `rrd_path` indicates an old (buggy) import.
 *
 * Old imports stored the path of the `.back` file (e.g. `acarshub.rrd.back`)
 * because the pre-registry code registered the backup hash AFTER renaming.
 * New imports store the canonical `.rrd` path (e.g. `acarshub.rrd`).
 *
 * Both `.back` and `.rrd.back` suffixes are covered because older deployments
 * registered the backup file path directly (e.g. `acarshub.rrd.back`).
 *
 * @param registeredPath - The `rrd_path` column value from the registry
 */
export function isOldImportPath(registeredPath: string): boolean {
  return registeredPath.endsWith(".rrd.back") || registeredPath.endsWith(".back");
}

/**
 * Retrieve the `rrd_path` stored in the import registry for the given hash.
 *
 * Returns null when the hash is not present, the registry table does not yet
 * exist, or any other error occurs.  Callers must treat null as "no entry".
 *
 * @param fileHash - SHA-256 hex string
 */
function getRegistryRrdPath(fileHash: string): string | null {
  try {
    const db = getDatabase();
    const row = db
      .select({ rrdPath: rrdImportRegistry.rrdPath })
      .from(rrdImportRegistry)
      .where(eq(rrdImportRegistry.fileHash, fileHash))
      .get();
    return row?.rrdPath ?? null;
  } catch {
    return null;
  }
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

// ============================================================================
// Bad-import repair helpers
// ============================================================================

/**
 * Read the `last_update` Unix timestamp from an RRD file using `rrdtool info`.
 *
 * `rrdtool info` output contains a line of the form:
 *   last_update = 1735689900
 *
 * Returns null if rrdtool is unavailable, the file is unreadable, or the
 * expected line is absent.  Callers must treat null as "repair not possible
 * without this value" and decide whether to skip the deletion step.
 *
 * @param rrdPath - Path to the RRD file (typically the .rrd.back copy)
 */
async function getRrdLastUpdate(rrdPath: string): Promise<number | null> {
  try {
    const { stdout } = await execAsync(`rrdtool info "${rrdPath}"`, {
      maxBuffer: 1 * 1024 * 1024,
    });
    const match = stdout.match(/^last_update\s*=\s*(\d+)/m);
    if (!match) {
      logger.warn("rrdtool info output did not contain last_update", {
        rrdPath,
      });
      return null;
    }
    return Number.parseInt(match[1], 10);
  } catch (error) {
    logger.warn("Failed to read RRD last_update via rrdtool info", {
      rrdPath,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Look up the `imported_at` Unix-seconds timestamp for the given backup file
 * from the import registry.
 *
 * `imported_at` is stored in milliseconds (Date.now()) in the registry; this
 * function converts it to seconds before returning.
 *
 * Returns null if the registry table does not exist, the hash is not found,
 * or any other error occurs.  Callers fall back to `Date.now()` when null.
 *
 * @param backupPath - Path to the .rrd.back file whose hash to look up
 */
function getRegistryImportedAt(backupPath: string): number | null {
  try {
    ensureRegistryTable();
    const fileHash = computeFileHash(backupPath);
    const db = getDatabase();
    const row = db
      .select({ importedAt: rrdImportRegistry.importedAt })
      .from(rrdImportRegistry)
      .where(eq(rrdImportRegistry.fileHash, fileHash))
      .get();
    // importedAt is stored as ms (Date.now()); convert to seconds.
    return row !== undefined ? Math.floor(row.importedAt / 1000) : null;
  } catch {
    return null;
  }
}

/**
 * Remove the registry entry for the given backup file so the importer will
 * treat the restored .rrd as a new file eligible for fresh import.
 *
 * Best-effort — logs at warn level on failure but never throws.
 *
 * @param backupPath - Path to the .rrd.back file whose registry entry to clear
 */
function clearRegistryEntry(backupPath: string): void {
  try {
    ensureRegistryTable();
    const fileHash = computeFileHash(backupPath);
    const db = getDatabase();
    db.delete(rrdImportRegistry)
      .where(eq(rrdImportRegistry.fileHash, fileHash))
      .run();
    logger.info("Cleared registry entry to allow repair re-import", {
      fileHash,
    });
  } catch (error) {
    logger.warn(
      "Could not clear registry entry — non-fatal; hash check may block re-import",
      {
        backupPath,
        error: error instanceof Error ? error.message : String(error),
      },
    );
  }
}

/**
 * Repair timeseries_stats after a bad RRD import, then restore .rrd.back → .rrd
 * so the fixed importer can re-populate the table correctly on this startup.
 *
 * WHY THIS IS NEEDED
 * ------------------
 * The original importer had two bugs that corrupted timeseries_stats:
 *
 *   1. Forward-expansion: coarse archive points were expanded forward in time
 *      (T, T+60, …, T+(N-1)*60) instead of backward (T-(N-1)*60, …, T).
 *      This placed historical data at wrong future timestamps and permanently
 *      squatted those slots — the live stats-writer's INSERT OR IGNORE is
 *      silently discarded for any slot already occupied.
 *
 *   2. NaN→0 rows: time slots with no RRD source data (the gap between
 *      rrd_last_update and import time) were inserted as all-zero rows instead
 *      of being skipped, producing false zero counts in the chart.
 *
 * THREE CLASSES OF BAD ROWS
 * -------------------------
 *   Class 1 — timestamp ≤ rrd_last_update
 *     All historically-imported rows.  Safe to delete unconditionally because
 *     the live stats-writer only ever writes "now" timestamps — no live data
 *     can exist in this range.  The fixed re-import will repopulate correctly.
 *
 *   Class 3 — rrd_last_update < timestamp ≤ rrd_last_update + 21600
 *     Forward-expansion overflow: the last coarse-archive point (at or near
 *     rrd_last_update) was expanded forward, placing incorrect values at up to
 *     21540 s (6 h) beyond rrd_last_update.  These squatted slots block the
 *     live stats-writer permanently.  Worst-case consequence of deleting: up
 *     to 6 hours of real live data from the window just after rrd_last_update
 *     is lost.  This is acceptable given that those same slots are currently
 *     occupied by wrong coarse-average values anyway.
 *
 *   Class 2 — rrd_last_update + 21600 < timestamp ≤ imported_at, all counts 0
 *     NaN-derived zero rows beyond the Class 3 window.  These are filtered by
 *     the all-zero condition to avoid deleting legitimate quiet periods that
 *     the live stats-writer wrote during that gap.
 *
 * REPAIR BEHAVIOUR WHEN rrd_last_update IS UNAVAILABLE
 * -----------------------------------------------------
 * If `rrdtool info` fails (binary missing, file unreadable), the three delete
 * steps are skipped and a warning is logged.  The file is still restored to
 * .rrd and the fresh import proceeds.  The fixed importer will add correctly-
 * positioned rows via INSERT OR IGNORE; old bad rows at wrong timestamps will
 * remain as historical noise but will never block new live-writer slots since
 * their timestamps are in the past.
 *
 * @param backupPath - Path to the .rrd.back file
 * @param rrdPath    - The canonical .rrd path to restore the file to
 * @returns true if the file was successfully restored (caller may proceed with
 *          fresh import); false if the rename itself failed (caller must abort)
 */
async function repairBadImport(
  backupPath: string,
  rrdPath: string,
): Promise<boolean> {
  logger.info("Starting bad-import repair for .rrd.back file", { backupPath });

  // ── Step 1: determine the RRD's last_update ──────────────────────────────
  const rrdLastUpdate = await getRrdLastUpdate(backupPath);

  if (rrdLastUpdate === null) {
    logger.warn(
      "Cannot determine rrd_last_update — skipping row deletion. " +
        "The fixed re-import will add correctly-positioned rows alongside " +
        "any remaining bad rows (which will age out over time).",
      { backupPath },
    );
  } else {
    // Upper bound for Class 2 (NaN zeros beyond the 6-hour overflow window).
    const importedAt =
      getRegistryImportedAt(backupPath) ?? Math.floor(Date.now() / 1000);
    const class3End = rrdLastUpdate + 21600;

    logger.info("Repair parameters resolved", {
      rrdLastUpdate,
      importedAt,
      class3WindowEnd: class3End,
    });

    const db = getDatabase();

    // Count rows before deletion for accurate reporting.
    const before =
      db.select({ count: count() }).from(timeseriesStats).get()?.count ?? 0;

    // Class 1: entire historical import range — zero live-data risk.
    db.delete(timeseriesStats)
      .where(lte(timeseriesStats.timestamp, rrdLastUpdate))
      .run();

    // Class 3: forward-expansion overflow window (up to 6 h after last_update).
    // Deleted unconditionally — these may be coarse-average squatters OR early
    // live-writer rows; either way the slot needs to be freed.
    db.delete(timeseriesStats)
      .where(
        and(
          gt(timeseriesStats.timestamp, rrdLastUpdate),
          lte(timeseriesStats.timestamp, class3End),
        ),
      )
      .run();

    // Class 2: NaN-derived zero rows beyond the Class 3 window.
    // Only deletes all-zero rows to preserve legitimate quiet-period records.
    if (importedAt > class3End) {
      db.delete(timeseriesStats)
        .where(
          and(
            gt(timeseriesStats.timestamp, class3End),
            lte(timeseriesStats.timestamp, importedAt),
            eq(timeseriesStats.acarsCount, 0),
            eq(timeseriesStats.vdlmCount, 0),
            eq(timeseriesStats.hfdlCount, 0),
            eq(timeseriesStats.imslCount, 0),
            eq(timeseriesStats.irdmCount, 0),
            eq(timeseriesStats.totalCount, 0),
          ),
        )
        .run();
    }

    const after =
      db.select({ count: count() }).from(timeseriesStats).get()?.count ?? 0;
    const rowsDeleted = before - after;

    logger.info("Repair: bad rows deleted from timeseries_stats", {
      rowsDeleted,
      remainingRows: after,
    });
  }

  // ── Step 2: clear registry so re-import is not blocked ───────────────────
  clearRegistryEntry(backupPath);

  // ── Step 3: restore .back → .rrd so the importer can read it ─────────────
  try {
    renameSync(backupPath, rrdPath);
    logger.info("Repair: restored .rrd.back to .rrd for re-import", {
      from: backupPath,
      to: rrdPath,
    });
    return true;
  } catch (error) {
    logger.error(
      "Repair: failed to restore .rrd.back → .rrd — cannot proceed with re-import",
      {
        backupPath,
        rrdPath,
        error: error instanceof Error ? error.message : String(error),
      },
    );
    return false;
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
 * See module-level JSDoc for the full sentinel-file hierarchy and repair path.
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

  const backupPath = `${rrdPath}.back`;

  // ── 1. Check .rrd.back — consult registry to decide: skip, repair, or fresh
  //
  // Both old and new importers leave the source file at .rrd.back after
  // completion.  The rrd_import_registry.rrd_path column is the discriminator:
  //
  //   rrd_path ends with ".back"   → old (buggy) import → repair + re-import
  //   rrd_path does NOT end ".back" → new (fixed) import → skip
  //   no registry entry             → unknown/legacy     → rename .back → .rrd
  //                                                         and fall through
  if (existsSync(backupPath)) {
    try {
      ensureRegistryTable();
      const backHash = computeFileHash(backupPath);
      const registeredPath = getRegistryRrdPath(backHash);

      if (registeredPath !== null) {
        if (isOldImportPath(registeredPath)) {
          // rrd_path ends with .back → file was imported by old buggy code.
          // Run repair to delete corrupted rows, clear the registry entry, and
          // rename .back → .rrd so the fixed importer can re-populate.
          logger.info(
            "Registry rrd_path ends with .back — old import detected; running repair",
            { backupPath, registeredPath },
          );
          const restored = await repairBadImport(backupPath, rrdPath);
          if (!restored) {
            return null;
          }
          // repairBadImport renamed .back → .rrd; fall through to normal import.
        } else {
          // rrd_path does not end with .back → file was imported by fixed code.
          // The registry records rrd_path = "acarshub.rrd" for all new imports.
          logger.info(
            "Registry rrd_path indicates new fixed import — already migrated, skipping",
            { backupPath, registeredPath },
          );
          return null;
        }
      } else {
        // No registry entry — unknown or pre-registry deployment.  Treat as a
        // fresh file: rename .back → .rrd and fall through to a normal import.
        // The hash check in step 4 will still catch it if somehow registered
        // under a different name.
        logger.info(
          ".rrd.back has no registry entry — treating as fresh file, renaming for import",
          { backupPath, rrdPath },
        );
        try {
          renameSync(backupPath, rrdPath);
          logger.info("Renamed .rrd.back to .rrd for fresh import", {
            from: backupPath,
            to: rrdPath,
          });
        } catch (renameError) {
          logger.error(
            "Failed to rename .rrd.back → .rrd — skipping migration",
            {
              error:
                renameError instanceof Error
                  ? renameError.message
                  : String(renameError),
            },
          );
          return null;
        }
        // Fall through to normal import.
      }
    } catch (registryError) {
      // Registry unavailable (e.g. DB not yet initialised on very first boot).
      // Conservative fallback: run the repair path so any old bad rows are
      // cleaned up before the fresh import proceeds.
      logger.warn(
        "Registry unavailable during .back check — falling back to repair path",
        {
          backupPath,
          error:
            registryError instanceof Error
              ? registryError.message
              : String(registryError),
        },
      );
      const restored = await repairBadImport(backupPath, rrdPath);
      if (!restored) {
        return null;
      }
      // Fall through to normal import.
    }
  }

  // ── 3. Check if RRD file exists ──────────────────────────────────────────
  if (!existsSync(rrdPath)) {
    logger.info("No RRD file found, skipping migration", { rrdPath });
    return null;
  }

  // ── 4. Validate RRD file ──────────────────────────────────────────────────
  if (!isValidRrdFile(rrdPath)) {
    logger.error("Invalid RRD file, cannot migrate", { rrdPath });
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

  // ── 4. Hash-based registry check ─────────────────────────────────────────
  //
  // Belt-and-suspenders guard: if the .rrd file's content hash is already in
  // the registry (e.g. user copied the original RRD back manually), skip.
  // The .back step above handles the normal rename-back case; this catches
  // anything that bypasses it.
  //
  // Wrapped in try-catch: registry operations are best-effort.  If the table
  // is not yet available the idempotent INSERT OR IGNORE in step 7 still
  // prevents duplicate rows at the DB level.
  let fileHash: string | null = null;
  try {
    ensureRegistryTable();
    fileHash = computeFileHash(rrdPath);

    if (isHashRegistered(fileHash)) {
      logger.warn(
        "RRD file content matches a previously imported file — skipping " +
          "(content hash already in registry)",
        { rrdPath, fileHash },
      );

      // Rename to .back so the next startup takes the registry fast-path.
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
    // ── 6. Fetch data from all archives ──────────────────────────────────────
    logger.info("Fetching data from RRD archives");
    const allDataPoints: Array<TimeseriesDataPoint & { archiveResolution: "1min" | "5min" | "1hour" | "6hour" }> = [];

    for (const archive of archives) {
      try {
        const dataPoints = await fetchRrdArchive(rrdPath, archive);
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

    // ── 7. Expand coarse archives to 1-minute resolution ─────────────────────
    logger.info("Expanding coarse data to 1-minute resolution");
    const expandedDataPoints = expandCoarseDataToOneMinute(allDataPoints);

    // ── 7b. Clamp future timestamps ───────────────────────────────────────────
    const nowSec = Math.floor(Date.now() / 1000);
    const clampedDataPoints = expandedDataPoints.filter(
      (p) => p.timestamp <= nowSec,
    );
    const clampedCount = expandedDataPoints.length - clampedDataPoints.length;
    if (clampedCount > 0) {
      logger.warn(
        "Clamped future-timestamp rows that would have pre-occupied live-stats slots",
        { clampedCount, nowSec },
      );
    }

    // ── 8. Insert data (idempotent: INSERT OR IGNORE) ─────────────────────────
    batchInsertDataPoints(clampedDataPoints);

    // ── 9. Register file hash ─────────────────────────────────────────────────
    if (fileHash !== null) {
      try {
        registerHash(fileHash, rrdPath, clampedDataPoints.length);
        logger.info("Registered import hash in registry", { fileHash });
      } catch (hashError) {
        logger.warn("Failed to register import hash — non-fatal", {
          error:
            hashError instanceof Error
              ? hashError.message
              : String(hashError),
        });
      }
    }

    // ── 9. Rename RRD file to .back ───────────────────────────────────────────
    // The registered rrd_path is "acarshub.rrd" (set in step 8 above), so on
    // the next startup the .back check will read rrd_path, see it does NOT end
    // with ".back", and skip — no further sentinel files needed.
    try {
      renameSync(rrdPath, backupPath);
      logger.info("Renamed RRD file to .back (import complete)", {
        from: rrdPath,
        to: backupPath,
      });
    } catch (error) {
      logger.error("Failed to rename RRD file to .back", {
        error: error instanceof Error ? error.message : String(error),
      });
      // Don't fail the migration if rename fails
    }

    const duration = Date.now() - startTime;

    logger.info("RRD migration complete", {
      success: true,
      rowsInserted: clampedDataPoints.length,
      duration,
    });

    return {
      success: true,
      rowsInserted: clampedDataPoints.length,
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
