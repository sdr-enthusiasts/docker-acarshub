// ----------------------------------------------------------------------------
// GOD-02: extracted from db/migrate.ts.
// Migration 9: Add timeseries_stats table
//
// This migration adds the timeseries_stats table for storing time-series
// statistics that replace the RRD (Round Robin Database) system.
//
// For new databases, migration01_initialSchema already creates this table
// via drizzleMigrate, but for existing databases that were migrated from
// the Python version or early TypeScript versions, we need to manually
// create this table.
//
// We manually apply the SQL instead of using drizzleMigrate to avoid
// conflicts with already-existing tables from previous migrations.
// ----------------------------------------------------------------------------

import type Database from "better-sqlite3";
import { createLogger } from "../../utils/logger.js";

const logger = createLogger("db:migrate-09");

export function migration09_addTimeseriesStats(db: Database.Database): void {
  logger.warn("Applying migration 9: add_timeseries_stats");

  // Check if timeseries_stats table exists
  const hasTimeseriesStats = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='timeseries_stats'",
    )
    .get();

  if (hasTimeseriesStats) {
    logger.warn("timeseries_stats table already exists, skipping");
    return;
  }

  // Manually create timeseries_stats table
  // This is the SQL from drizzle/0001_add_timeseries_stats.sql
  logger.warn("Creating timeseries_stats table");

  const migrate = db.transaction(() => {
    db.exec(`
      CREATE TABLE timeseries_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        timestamp INTEGER NOT NULL,
        resolution TEXT NOT NULL,
        acars_count INTEGER DEFAULT 0 NOT NULL,
        vdlm_count INTEGER DEFAULT 0 NOT NULL,
        hfdl_count INTEGER DEFAULT 0 NOT NULL,
        imsl_count INTEGER DEFAULT 0 NOT NULL,
        irdm_count INTEGER DEFAULT 0 NOT NULL,
        total_count INTEGER DEFAULT 0 NOT NULL,
        error_count INTEGER DEFAULT 0 NOT NULL,
        created_at INTEGER NOT NULL
      )
    `);

  });

  migrate();

  logger.warn("✓ timeseries_stats table created successfully");
}
