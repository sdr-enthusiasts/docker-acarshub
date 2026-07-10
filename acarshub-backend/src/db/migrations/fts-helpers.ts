// ----------------------------------------------------------------------------
// GOD-02: extracted from db/migrate.ts.
//
// FTS schema helpers — shared between migration04, migration10, and the
// unconditional startup integrity check (verifyAndRepairFtsIfNeeded, called
// from migrate.ts's runMigrations() on every startup).
//
// FTS Schema Integrity
// --------------------
// The messages_fts virtual table was originally created by the Python/pre-Alembic
// upgrade_db.py with only 8 indexed columns (depa, dsta, msg_text, tail, flight,
// icao, freq, label).  Both the Python Alembic migration 94d97e655180 and the
// TypeScript migration04_createFTS have a "skip if exists" guard, which means any
// database that went through Alembic with an existing 8-column FTS table kept the
// old schema and old triggers forever.
//
// verifyAndRepairFtsIfNeeded() runs unconditionally at the end of every
// runMigrations() call (i.e., every startup) and detects the stale schema by
// checking whether `message_type` appears in the sqlite_master sql for both the
// table and the insert trigger.  If either is missing it drops everything and
// rebuilds from scratch; disk space is reclaimed by the VACUUM in runMigrations().
// ----------------------------------------------------------------------------

import type Database from "better-sqlite3";
import { createLogger } from "../../utils/logger.js";
import { assertRowOrUndefined } from "../helpers.js";

const logger = createLogger("db:migrate-fts-helpers");

/**
 * Sentinel column that exists in the correct 31-column FTS schema but is
 * absent in the legacy 8-column schema created by the pre-Alembic upgrade_db.py.
 * Checking for its presence in the sqlite_master `sql` text is sufficient to
 * distinguish old from new for both the virtual table definition and the triggers.
 */
const FTS_SENTINEL_COLUMN = "message_type";

/**
 * Return true if messages_fts exists AND its CREATE VIRTUAL TABLE sql contains
 * the sentinel column name, indicating the full 31-column schema is in place.
 */
export function isFtsSchemaCorrect(db: Database.Database): boolean {
  const raw = db
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='messages_fts'",
    )
    .get();
  const row = assertRowOrUndefined<{ sql: string }>(
    raw,
    ["sql"],
    "isFtsSchemaCorrect",
  );

  if (!row) return false;
  return row.sql.includes(FTS_SENTINEL_COLUMN);
}

/**
 * Return true if all three FTS triggers exist AND each contains the sentinel
 * column name, indicating they were created against the full 31-column schema.
 */
export function areFtsTriggersCorrect(db: Database.Database): boolean {
  const triggerNames = [
    "messages_fts_insert",
    "messages_fts_delete",
    "messages_fts_update",
  ] as const;

  for (const name of triggerNames) {
    const raw = db
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type='trigger' AND name=?",
      )
      .get(name);
    const row = assertRowOrUndefined<{ sql: string }>(
      raw,
      ["sql"],
      `areFtsTriggersCorrect[${name}]`,
    );

    if (!row) return false;
    if (!row.sql.includes(FTS_SENTINEL_COLUMN)) return false;
  }

  return true;
}

/**
 * Drop all three FTS triggers and the FTS virtual table (and its shadow tables).
 * Safe to call even when they do not exist.
 */
export function dropFtsTableAndTriggers(db: Database.Database): void {
  db.exec("DROP TRIGGER IF EXISTS messages_fts_insert");
  db.exec("DROP TRIGGER IF EXISTS messages_fts_delete");
  db.exec("DROP TRIGGER IF EXISTS messages_fts_update");
  db.exec("DROP TABLE IF EXISTS messages_fts");
}

/**
 * Create the FTS5 virtual table, all three triggers, and populate the index
 * from the current contents of the messages table via rebuild.
 *
 * Callers are responsible for ensuring the table and triggers do not already
 * exist before calling this function.
 */
export function createFtsTableAndTriggers(db: Database.Database): void {
  // Create FTS5 virtual table
  db.exec(`
    CREATE VIRTUAL TABLE messages_fts USING fts5(
      message_type UNINDEXED,
      msg_time,
      station_id UNINDEXED,
      toaddr UNINDEXED,
      fromaddr UNINDEXED,
      depa,
      dsta,
      eta UNINDEXED,
      gtout UNINDEXED,
      gtin UNINDEXED,
      wloff UNINDEXED,
      wlin UNINDEXED,
      lat UNINDEXED,
      lon UNINDEXED,
      alt UNINDEXED,
      msg_text,
      tail,
      flight,
      icao,
      freq,
      ack UNINDEXED,
      mode UNINDEXED,
      label,
      block_id UNINDEXED,
      msgno UNINDEXED,
      is_response UNINDEXED,
      is_onground UNINDEXED,
      error UNINDEXED,
      libacars UNINDEXED,
      level UNINDEXED,
      content=messages,
      content_rowid=id
    );
  `);

  // INSERT trigger
  db.exec(`
    CREATE TRIGGER messages_fts_insert AFTER INSERT ON messages
    BEGIN
      INSERT INTO messages_fts (
        rowid, message_type, msg_time, station_id, toaddr, fromaddr,
        depa, dsta, eta, gtout, gtin, wloff, wlin, lat, lon, alt,
        msg_text, tail, flight, icao, freq, ack, mode, label,
        block_id, msgno, is_response, is_onground, error, libacars, level
      ) VALUES (
        new.id, new.message_type, new.msg_time, new.station_id, new.toaddr, new.fromaddr,
        new.depa, new.dsta, new.eta, new.gtout, new.gtin, new.wloff, new.wlin, new.lat, new.lon, new.alt,
        new.msg_text, new.tail, new.flight, new.icao, new.freq, new.ack, new.mode, new.label,
        new.block_id, new.msgno, new.is_response, new.is_onground, new.error, new.libacars, new.level
      );
    END;
  `);

  // DELETE trigger
  db.exec(`
    CREATE TRIGGER messages_fts_delete AFTER DELETE ON messages
    BEGIN
      INSERT INTO messages_fts (
        messages_fts, rowid, message_type, msg_time, station_id, toaddr, fromaddr,
        depa, dsta, eta, gtout, gtin, wloff, wlin, lat, lon, alt,
        msg_text, tail, flight, icao, freq, ack, mode, label,
        block_id, msgno, is_response, is_onground, error, libacars, level
      ) VALUES (
        'delete', old.id, old.message_type, old.msg_time, old.station_id, old.toaddr, old.fromaddr,
        old.depa, old.dsta, old.eta, old.gtout, old.gtin, old.wloff, old.wlin, old.lat, old.lon, old.alt,
        old.msg_text, old.tail, old.flight, old.icao, old.freq, old.ack, old.mode, old.label,
        old.block_id, old.msgno, old.is_response, old.is_onground, old.error, old.libacars, old.level
      );
    END;
  `);

  // UPDATE trigger
  db.exec(`
    CREATE TRIGGER messages_fts_update AFTER UPDATE ON messages
    BEGIN
      INSERT INTO messages_fts (
        messages_fts, rowid, message_type, msg_time, station_id, toaddr, fromaddr,
        depa, dsta, eta, gtout, gtin, wloff, wlin, lat, lon, alt,
        msg_text, tail, flight, icao, freq, ack, mode, label,
        block_id, msgno, is_response, is_onground, error, libacars, level
      ) VALUES (
        'delete', old.id, old.message_type, old.msg_time, old.station_id, old.toaddr, old.fromaddr,
        old.depa, old.dsta, old.eta, old.gtout, old.gtin, old.wloff, old.wlin, old.lat, old.lon, old.alt,
        old.msg_text, old.tail, old.flight, old.icao, old.freq, old.ack, old.mode, old.label,
        old.block_id, old.msgno, old.is_response, old.is_onground, old.error, old.libacars, old.level
      );
      INSERT INTO messages_fts (
        rowid, message_type, msg_time, station_id, toaddr, fromaddr,
        depa, dsta, eta, gtout, gtin, wloff, wlin, lat, lon, alt,
        msg_text, tail, flight, icao, freq, ack, mode, label,
        block_id, msgno, is_response, is_onground, error, libacars, level
      ) VALUES (
        new.id, new.message_type, new.msg_time, new.station_id, new.toaddr, new.fromaddr,
        new.depa, new.dsta, new.eta, new.gtout, new.gtin, new.wloff, new.wlin, new.lat, new.lon, new.alt,
        new.msg_text, new.tail, new.flight, new.icao, new.freq, new.ack, new.mode, new.label,
        new.block_id, new.msgno, new.is_response, new.is_onground, new.error, new.libacars, new.level
      );
    END;
  `);

  // Populate the index from the current messages table
  logger.warn("Rebuilding FTS index from existing messages...");
  db.exec("INSERT INTO messages_fts(messages_fts) VALUES ('rebuild')");
  logger.warn("FTS rebuild complete");
}

/**
 * Verify that the messages_fts virtual table and its three triggers use the
 * current 31-column schema.  If not, drop everything and rebuild from scratch.
 * Returns true if a rebuild was performed, false otherwise.
 *
 * This runs unconditionally at the end of every runMigrations() call, which
 * means it executes on every startup regardless of whether any migration was
 * actually applied.  That makes it safe for databases that are already at the
 * latest Alembic version and would therefore never pass through migration04
 * again.
 *
 * Background: the pre-Alembic upgrade_db.py created messages_fts with only
 * 8 columns (depa, dsta, msg_text, tail, flight, icao, freq, label).  Both
 * the Python Alembic migration 94d97e655180 and the TypeScript migration04
 * silently skipped the table if it already existed, leaving the 8-column
 * schema and its weaker triggers in place indefinitely.
 */
export function verifyAndRepairFtsIfNeeded(db: Database.Database): boolean {
  const hasFTS = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='messages_fts'",
    )
    .get();

  if (!hasFTS) {
    // Table doesn't exist at all — nothing to repair; migration04 will create it.
    logger.debug("FTS table absent, skipping integrity check");
    return false;
  }

  const schemaOk = isFtsSchemaCorrect(db);
  const triggersOk = areFtsTriggersCorrect(db);

  if (schemaOk && triggersOk) {
    logger.info("FTS schema and triggers verified OK");
    return false;
  }

  logger.warn(
    "FTS schema or triggers are stale — full rebuild required",
    { schemaOk, triggersOk },
  );

  logger.warn("Dropping stale FTS table and triggers...");
  dropFtsTableAndTriggers(db);

  logger.warn("Recreating FTS table and triggers with correct schema...");
  createFtsTableAndTriggers(db);

  logger.warn("FTS repair finished");
  return true;
}
