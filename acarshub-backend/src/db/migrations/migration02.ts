// ----------------------------------------------------------------------------
// GOD-02: extracted from db/migrate.ts.
// Migration 2: Split signal level table (0fc8b7cae596)
//
// This migration:
// 1. Drops the old unified 'level' table (no decoder column in initial state)
// 2. Creates per-decoder level tables
// 3. Rebuilds signal level statistics from the messages table
// ----------------------------------------------------------------------------

import { type DecoderKey, decoderKeyFromMessageType } from "@acarshub/types";
import type Database from "better-sqlite3";
import { createLogger } from "../../utils/logger.js";

const logger = createLogger("db:migrate-02");

/**
 * Insert per-level message counts for one decoder into `tableName`,
 * aggregated from the `messages` table.
 *
 * `messages.message_type` holds several spellings of the same decoder
 * (legacy `"IMS-L"` / `"VDL-M2"` alongside `"IMSL"` / `"VDLM2"`), so the
 * distinct stored values are resolved through
 * {@link decoderKeyFromMessageType} instead of a hand-written alias list —
 * the earlier list omitted `"IMS-L"`, so IMSL levels were never counted.
 *
 * Levels are CAST to REAL and grouped on the result; NULL and empty levels
 * are skipped. Rows are appended — callers that need a full rebuild must
 * clear the table first.
 */
export function rebuildLevelTableFromMessages(
  db: Database.Database,
  tableName: string,
  decoderKey: DecoderKey,
): void {
  const storedTypes = (
    db.prepare("SELECT DISTINCT message_type FROM messages").all() as Array<{
      message_type: string;
    }>
  )
    .map((row) => row.message_type)
    .filter((type) => decoderKeyFromMessageType(type) === decoderKey);

  if (storedTypes.length === 0) {
    return;
  }

  const placeholders = storedTypes.map(() => "?").join(", ");
  db.prepare(
    `
      INSERT INTO ${tableName} (level, count)
      SELECT CAST(level AS REAL) as level_float, COUNT(*) as msg_count
      FROM messages
      WHERE message_type IN (${placeholders})
        AND level IS NOT NULL
        AND level != ''
      GROUP BY level_float
    `,
  ).run(...storedTypes);
}

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

    const decoderTables: ReadonlyArray<readonly [DecoderKey, string]> = [
      ["acars", "level_acars"],
      ["vdlm2", "level_vdlm2"],
      ["hfdl", "level_hfdl"],
      ["imsl", "level_imsl"],
      ["irdm", "level_irdm"],
    ];

    for (const [decoderKey, tableName] of decoderTables) {
      rebuildLevelTableFromMessages(db, tableName, decoderKey);
    }

    logger.warn("Signal level data rebuilt from messages");
  });

  migrate();
}
