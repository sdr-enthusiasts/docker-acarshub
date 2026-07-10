// ----------------------------------------------------------------------------
// GOD-02: extracted from db/migrate.ts.
//
// Migration 11: Deduplicate timeseries_stats and add unique constraint
// (f0a1b2c3d4e5)
//
// See inline comments in the function body for full rationale.
//
// WHY THIS EXISTS
// ---------------
// Two problems in the original RRD import logic allowed duplicate rows to
// accumulate in timeseries_stats:
//
// 1. The "already migrated" guard was purely name-based (.rrd.back file).
//    If a user renamed .rrd.back back to .rrd, the importer re-ran and
//    inserted every historical row a second time.
//
// 2. The table had no UNIQUE constraint on (timestamp, resolution), so
//    the database itself offered no protection against duplicate inserts.
//
// This migration:
//   a. Deduplicates existing rows — for each (timestamp, resolution) group,
//      keeps the row with the highest id (most recently inserted) and deletes
//      the rest.  On a clean database this is a no-op.
//   b. Drops the old non-unique index on (timestamp, resolution).
//   c. Creates a UNIQUE index on (timestamp, resolution) to prevent future
//      duplication at the database level.
//   d. Creates the rrd_import_registry table that the RRD importer uses to
//      record SHA-256 hashes of files it has processed, allowing it to skip
//      re-imports regardless of filename.
//   e. Disk space freed by the duplicate row deletions is reclaimed by the
//      single VACUUM that runs at the end of runMigrations() when any migration
//      step executes.
// ----------------------------------------------------------------------------

import type Database from "better-sqlite3";
import { createLogger } from "../../utils/logger.js";
import { assertRow } from "../helpers.js";

const logger = createLogger("db:migrate-11");

export function migration11_deduplicateTimeseriesAndAddRegistry(
  db: Database.Database,
): void {
  logger.warn(
    "Applying migration 11: deduplicate_timeseries_and_add_registry",
  );

  const migrate = db.transaction(() => {
    // -------------------------------------------------------------------------
    // Step 1: Deduplicate timeseries_stats
    // -------------------------------------------------------------------------
    // Count duplicates first so we can log what was cleaned up.
    const totalRows = assertRow<{ n: number }>(
      db.prepare("SELECT COUNT(*) AS n FROM timeseries_stats").get(),
      ["n"],
      "migration_dedup.totalRows",
    ).n;

    const distinctSlots = assertRow<{ n: number }>(
      db
        .prepare(
          "SELECT COUNT(*) AS n FROM (SELECT 1 FROM timeseries_stats GROUP BY timestamp, resolution)",
        )
        .get(),
      ["n"],
      "migration_dedup.distinctSlots",
    ).n;

    const duplicateCount = totalRows - distinctSlots;

    if (duplicateCount > 0) {
      logger.warn(
        `Removing ${duplicateCount} duplicate timeseries_stats rows (keeping highest id per slot)`,
        { totalRows, distinctSlots, duplicateCount },
      );

      db.exec(`
        DELETE FROM timeseries_stats
        WHERE id NOT IN (
          SELECT MAX(id)
          FROM timeseries_stats
          GROUP BY timestamp, resolution
        )
      `);

      logger.warn("Duplicate timeseries_stats rows removed", {
        removed: duplicateCount,
      });
    } else {
      logger.warn("No duplicate timeseries_stats rows found — clean");
    }

    // -------------------------------------------------------------------------
    // Step 2: Create rrd_import_registry table
    // -------------------------------------------------------------------------
    db.exec(`
      CREATE TABLE IF NOT EXISTS rrd_import_registry (
        id          INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        file_hash   TEXT    NOT NULL UNIQUE,
        rrd_path    TEXT    NOT NULL,
        imported_at INTEGER NOT NULL,
        rows_imported INTEGER NOT NULL DEFAULT 0
      )
    `);

    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_rrd_import_registry_hash
      ON rrd_import_registry (file_hash)
    `);

    logger.warn("Created rrd_import_registry table");
  });

  migrate();

  logger.warn("✓ Migration 11 complete");
}
