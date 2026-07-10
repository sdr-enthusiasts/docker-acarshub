// ----------------------------------------------------------------------------
// GOD-02: extracted from db/migrate.ts.
//
// Migration 12: Drop resolution/id columns, promote timestamp to INTEGER PRIMARY KEY
// (b6c7d8e9f0a1)
//
// WHY THIS EXISTS
// ---------------
// After migration 11 the `resolution` column in timeseries_stats is effectively
// a non-nullable constant — every row has resolution = '1min'. The original
// multi-resolution storage design (1min / 5min / 1hour / 6hour) was abandoned
// when the RRD importer was written to expand all coarser archives into 1-minute
// buckets before inserting. The live stats-writer likewise only ever inserts
// resolution = '1min'. The standalone `idx_timeseries_resolution` index is never
// used by any query in the application.
//
// This migration rebuilds the table to:
//   a. Drop the auto-increment `id` column (~8 bytes / row overhead)
//   b. Drop the dead `resolution` column (~4-8 bytes / row overhead)
//   c. Promote `timestamp` to INTEGER PRIMARY KEY — in SQLite this is the rowid
//      alias, the most storage-efficient key possible with no separate index B-tree
//   d. Drop idx_timeseries_resolution (completely unused)
//   e. Drop idx_timeseries_timestamp_resolution (superseded by the PK B-tree)
//   f. Freed pages are reclaimed by the single VACUUM that runs at the end of
//      runMigrations() when any migration step executes (can be several hundred
//      MB on a 3-year DB)
//
// SAFETY FOR USERS ON MIGRATION 10 OR EARLIER
// --------------------------------------------
// Migration 11 already deduplicates on (timestamp, resolution) so within each
// resolution bucket there are no duplicate rows by the time this migration runs.
// The remaining edge case — same timestamp appearing under two different resolution
// values — is handled by INSERT OR IGNORE ordered to keep the '1min' row first.
// Non-'1min' rows that conflict are logged as a warning and discarded; they
// represent data that was never readable by the application anyway.
// ----------------------------------------------------------------------------

import type Database from "better-sqlite3";
import { createLogger } from "../../utils/logger.js";
import { assertRow } from "../helpers.js";

const logger = createLogger("db:migrate-12");

export function migration12_dropResolutionPromoteTimestampPk(
  db: Database.Database,
): void {
  logger.warn(
    "Applying migration 12: drop_resolution_promote_timestamp_pk",
  );

  const migrate = db.transaction(() => {
    // -----------------------------------------------------------------------
    // Step 1: Diagnose — log anything unexpected before we touch data
    // -----------------------------------------------------------------------
    const nonOneMin = assertRow<{ n: number }>(
      db
        .prepare(
          "SELECT COUNT(*) AS n FROM timeseries_stats WHERE resolution != '1min'",
        )
        .get(),
      ["n"],
      "migration12.nonOneMin",
    ).n;

    if (nonOneMin > 0) {
      logger.warn(
        `Found ${nonOneMin} non-'1min' rows in timeseries_stats — ` +
          "these will be discarded; only 1-minute data is retained going forward",
        { nonOneMin },
      );
    }

    const totalRows = assertRow<{ n: number }>(
      db.prepare("SELECT COUNT(*) AS n FROM timeseries_stats").get(),
      ["n"],
      "migration12.totalRows",
    ).n;
    logger.warn("timeseries_stats row count before migration 12", {
      totalRows,
    });

    // Free space for adsb.im users. Also anyone else.

    db.exec(`DROP INDEX IF EXISTS idx_timeseries_resolution;`);
    db.exec(`DROP INDEX IF EXISTS idx_timeseries_timestamp_resolution;`);

    // -----------------------------------------------------------------------
    // Step 2: Create new table — timestamp is INTEGER PRIMARY KEY (rowid alias)
    // -----------------------------------------------------------------------
    db.exec(`
      CREATE TABLE timeseries_stats_new (
        timestamp   INTEGER PRIMARY KEY NOT NULL,
        acars_count INTEGER NOT NULL DEFAULT 0,
        vdlm_count  INTEGER NOT NULL DEFAULT 0,
        hfdl_count  INTEGER NOT NULL DEFAULT 0,
        imsl_count  INTEGER NOT NULL DEFAULT 0,
        irdm_count  INTEGER NOT NULL DEFAULT 0,
        total_count INTEGER NOT NULL DEFAULT 0,
        error_count INTEGER NOT NULL DEFAULT 0
      )
    `);

    // -----------------------------------------------------------------------
    // Step 3: Copy data
    //
    // ORDER BY puts '1min' rows first so that INSERT OR IGNORE keeps the
    // correct row when the same timestamp appears under two different
    // resolution values (an unlikely but possible state on DBs that were
    // never fully migrated through the RRD importer).
    // -----------------------------------------------------------------------
    db.exec(`
      INSERT OR IGNORE INTO timeseries_stats_new
        (timestamp, acars_count, vdlm_count, hfdl_count,
         imsl_count, irdm_count, total_count, error_count)
      SELECT
        timestamp, acars_count, vdlm_count, hfdl_count,
        imsl_count, irdm_count, total_count, error_count
      FROM timeseries_stats
      ORDER BY
        CASE WHEN resolution = '1min' THEN 0 ELSE 1 END,
        id
    `);

    const copiedRows = assertRow<{ n: number }>(
      db.prepare("SELECT COUNT(*) AS n FROM timeseries_stats_new").get(),
      ["n"],
      "migration12.copiedRows",
    ).n;
    logger.warn("Rows copied to new timeseries_stats", { copiedRows });

    // -----------------------------------------------------------------------
    // Step 4: Swap — drop old, rename new
    // -----------------------------------------------------------------------
    db.exec("DROP TABLE timeseries_stats");
    db.exec(
      "ALTER TABLE timeseries_stats_new RENAME TO timeseries_stats",
    );

    logger.warn(
      "timeseries_stats rebuilt — timestamp is now INTEGER PRIMARY KEY, " +
        "resolution and id columns removed, old indexes dropped",
    );
  });

  migrate();

  logger.warn("✓ Migration 12 complete");
}
