// ----------------------------------------------------------------------------
// GOD-02: extracted from db/migrate.ts.
//
// Database-state detection helpers used by runMigrations() to decide where
// in the MIGRATIONS array to start: reading/writing the alembic_version
// bookkeeping table, and recognising a database that predates that table
// (the "initial migration state" fingerprint).
// ----------------------------------------------------------------------------

import type Database from "better-sqlite3";
import { createLogger } from "../../utils/logger.js";
import { assertRow } from "../helpers.js";

const logger = createLogger("db:migrate-state-detection");

/**
 * Get current Alembic version
 */
export function getAlembicVersion(db: Database.Database): string | null {
  const tableExists = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='alembic_version'",
    )
    .get();

  if (!tableExists) return null;

  const result = db.prepare("SELECT version_num FROM alembic_version").get() as
    | { version_num: string }
    | undefined;

  return result?.version_num || null;
}

/**
 * Set Alembic version
 */
export function setAlembicVersion(
  db: Database.Database,
  version: string,
): void {
  const tableExists = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='alembic_version'",
    )
    .get();

  if (!tableExists) {
    db.exec("CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL)");
    db.prepare("INSERT INTO alembic_version (version_num) VALUES (?)").run(
      version,
    );
  } else {
    db.prepare("UPDATE alembic_version SET version_num = ?").run(version);
  }
}

/**
 * Check if database has any tables
 */
export function hasAnyTables(db: Database.Database): boolean {
  const result = db
    .prepare(
      "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    )
    .get();
  const row = assertRow<{ count: number }>(
    result,
    ["count"],
    "hasExistingTables",
  );
  return row.count > 0;
}

/**
 * Check if database matches the initial Alembic migration state (e7991f1644b1)
 *
 * The initial state should have:
 * - messages table WITHOUT uid or aircraft_id columns
 * - freqs table (unified, not split by decoder)
 * - level table (unified, not split by decoder)
 * - messages_fts virtual table
 * - count, nonlogged_count, alert_stats, ignore_alert_terms tables
 *
 * Returns true if the database structure matches the initial migration exactly
 */
export function isAtInitialMigrationState(db: Database.Database): boolean {
  try {
    // Check for expected tables
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'messages_fts%'",
      )
      .all() as Array<{ name: string }>;

    const tableNames = new Set(tables.map((t) => t.name));

    // Must have these core tables
    const requiredTables = [
      "messages",
      "freqs",
      "level",
      "count",
      "nonlogged_count",
      "alert_stats",
      "ignore_alert_terms",
    ];

    for (const table of requiredTables) {
      if (!tableNames.has(table)) {
        return false;
      }
    }

    // Must NOT have split tables (those come in later migrations)
    const shouldNotExist = [
      "level_acars",
      "level_vdlm2",
      "freqs_acars",
      "freqs_vdlm2",
      "alert_matches",
    ];

    for (const table of shouldNotExist) {
      if (tableNames.has(table)) {
        return false;
      }
    }

    // Check messages table structure - should NOT have uid or aircraft_id
    const columns = db.prepare("PRAGMA table_info(messages)").all() as Array<{
      name: string;
    }>;

    const columnNames = new Set(columns.map((c) => c.name));

    // Must have basic columns
    const requiredColumns = [
      "id",
      "message_type",
      "msg_time",
      "icao",
      "tail",
      "flight",
    ];
    for (const col of requiredColumns) {
      if (!columnNames.has(col)) {
        return false;
      }
    }

    // Must NOT have columns from later migrations
    if (columnNames.has("uid") || columnNames.has("aircraft_id")) {
      return false;
    }

    // Check for messages_fts virtual table
    const ftsTable = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='messages_fts'",
      )
      .get();

    if (!ftsTable) {
      return false;
    }

    // If all checks pass, this is the initial migration state
    return true;
  } catch (error) {
    logger.error("Error checking initial migration state", {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
