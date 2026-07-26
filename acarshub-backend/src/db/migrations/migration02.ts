// ----------------------------------------------------------------------------
// GOD-02: extracted from db/migrate.ts.
// Migration 2: Split signal level table (0fc8b7cae596)
//
// This migration:
// 1. Drops the old unified 'level' table (no decoder column in initial state)
// 2. Creates per-decoder level tables
// 3. Rebuilds signal level statistics from the messages table
// ----------------------------------------------------------------------------

import type Database from "better-sqlite3";
import { createLogger } from "../../utils/logger.js";

const logger = createLogger("db:migrate-02");

export function migration02_splitSignalLevelTable(db: Database.Database): void {
  logger.warn("Applying migration 2: split_signal_level_table");

  const hasLevelAcars = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='level_acars'",
    )
    .get();

  if (hasLevelAcars) {
    logger.warn("Signal level tables already split, skipping");
    return;
  }

  const hasLevelTable = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='level'",
    )
    .get();

  // Wrap entire migration in transaction
  const migrate = db.transaction(() => {
    if (hasLevelTable) {
      logger.warn("Dropping old level table (will rebuild from messages)");
      db.exec("DROP TABLE level");
    }

    // Create per-decoder signal level tables
    logger.warn("Creating per-decoder level tables");
    db.exec(`
      CREATE TABLE level_acars (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        level REAL,
        count INTEGER
      );
      CREATE TABLE level_vdlm2 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        level REAL,
        count INTEGER
      );
      CREATE TABLE level_hfdl (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        level REAL,
        count INTEGER
      );
      CREATE TABLE level_imsl (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        level REAL,
        count INTEGER
      );
      CREATE TABLE level_irdm (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        level REAL,
        count INTEGER
      );
    `);

    // Create indexes on level column for fast lookups
    db.exec(`
      CREATE INDEX ix_level_acars_level ON level_acars(level);
      CREATE INDEX ix_level_vdlm2_level ON level_vdlm2(level);
      CREATE INDEX ix_level_hfdl_level ON level_hfdl(level);
      CREATE INDEX ix_level_imsl_level ON level_imsl(level);
      CREATE INDEX ix_level_irdm_level ON level_irdm(level);
    `);

    // Rebuild signal level statistics from messages table
    // This matches Alembic behavior - aggregate by message_type and level
    logger.warn("Rebuilding signal level statistics from messages table");

    const decoderMapping = {
      ACARS: "level_acars",
      "VDL-M2": "level_vdlm2",
      VDLM2: "level_vdlm2", // Alternative spelling
      HFDL: "level_hfdl",
      IMSL: "level_imsl",
      IRDM: "level_irdm",
    };

    for (const [messageType, tableName] of Object.entries(decoderMapping)) {
      db.exec(`
        INSERT INTO ${tableName} (level, count)
        SELECT CAST(level AS REAL) as level_float, COUNT(*) as msg_count
        FROM messages
        WHERE message_type = '${messageType}'
          AND level IS NOT NULL
          AND level != ''
        GROUP BY level_float
      `);
    }

    logger.warn("Signal level data rebuilt from messages");
  });

  migrate();
}
