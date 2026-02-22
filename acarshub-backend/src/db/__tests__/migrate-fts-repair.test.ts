/**
 * Tests for FTS schema verification and repair logic
 *
 * Two failure paths are covered:
 *
 * 1. migration04 path — a database entering migration04 that already has the
 *    legacy 8-column FTS (from the pre-Alembic upgrade_db.py).  The old "skip
 *    if exists" guard meant the 8-column schema was silently preserved.  Now
 *    migration04 detects the stale schema and rebuilds.
 *
 * 2. Startup repair path — a database that is already at the latest Alembic
 *    version (so no migrations run) but still carries the 8-column FTS from
 *    the pre-Alembic era.  verifyAndRepairFtsIfNeeded() detects and fixes this
 *    unconditionally on every startup via the tail of runMigrations().
 *
 * The sentinel that distinguishes old from new is the column `message_type`,
 * which is present in the 31-column schema but absent from the 8-column one.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { runMigrations } from "../migrate.js";

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

/**
 * The legacy 8-column FTS schema produced by the pre-Alembic upgrade_db.py.
 * `message_type` is intentionally absent — that is the sentinel we check for.
 */
const LEGACY_FTS_TABLE_SQL = `
  CREATE VIRTUAL TABLE messages_fts USING fts5(
    depa, dsta, msg_text, tail, flight, icao, freq, label,
    content=messages,
    content_rowid=id
  )
`;

const LEGACY_TRIGGER_INSERT = `
  CREATE TRIGGER messages_fts_insert AFTER INSERT ON messages
  BEGIN
    INSERT INTO messages_fts (rowid, depa, dsta, msg_text, tail, flight, icao, freq, label)
    VALUES (new.id, new.depa, new.dsta, new.msg_text, new.tail, new.flight, new.icao, new.freq, new.label);
  END
`;

const LEGACY_TRIGGER_DELETE = `
  CREATE TRIGGER messages_fts_delete AFTER DELETE ON messages
  BEGIN
    INSERT INTO messages_fts (messages_fts, rowid, depa, dsta, msg_text, tail, flight, icao, freq, label)
    VALUES ('delete', old.id, old.depa, old.dsta, old.msg_text, old.tail, old.flight, old.icao, old.freq, old.label);
  END
`;

const LEGACY_TRIGGER_UPDATE = `
  CREATE TRIGGER messages_fts_update AFTER UPDATE ON messages
  BEGIN
    INSERT INTO messages_fts (messages_fts, rowid, depa, dsta, msg_text, tail, flight, icao, freq, label)
    VALUES ('delete', old.id, old.depa, old.dsta, old.msg_text, old.tail, old.flight, old.icao, old.freq, old.label);
    INSERT INTO messages_fts (rowid, depa, dsta, msg_text, tail, flight, icao, freq, label)
    VALUES (new.id, new.depa, new.dsta, new.msg_text, new.tail, new.flight, new.icao, new.freq, new.label);
  END
`;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Drop the FTS virtual table (cascades to shadow tables) and all three triggers. */
function dropFts(db: Database.Database): void {
  db.exec("DROP TRIGGER IF EXISTS messages_fts_insert");
  db.exec("DROP TRIGGER IF EXISTS messages_fts_delete");
  db.exec("DROP TRIGGER IF EXISTS messages_fts_update");
  db.exec("DROP TABLE IF EXISTS messages_fts");
}

/**
 * Replace whatever FTS is present with the legacy 8-column schema and
 * matching triggers, then rebuild the index from the current messages rows.
 */
function installLegacyFts(db: Database.Database): void {
  dropFts(db);
  db.exec(LEGACY_FTS_TABLE_SQL);
  db.exec(LEGACY_TRIGGER_INSERT);
  db.exec(LEGACY_TRIGGER_DELETE);
  db.exec(LEGACY_TRIGGER_UPDATE);
  db.exec("INSERT INTO messages_fts(messages_fts) VALUES ('rebuild')");
}

/**
 * Replace only the triggers with the legacy 8-column versions while leaving
 * the FTS virtual table intact.  Used to test the "correct table, wrong
 * triggers" scenario.
 */
function installLegacyTriggersOnly(db: Database.Database): void {
  db.exec("DROP TRIGGER IF EXISTS messages_fts_insert");
  db.exec("DROP TRIGGER IF EXISTS messages_fts_delete");
  db.exec("DROP TRIGGER IF EXISTS messages_fts_update");
  db.exec(LEGACY_TRIGGER_INSERT);
  db.exec(LEGACY_TRIGGER_DELETE);
  db.exec(LEGACY_TRIGGER_UPDATE);
}

/** Assert that the FTS virtual table uses the 31-column schema. */
function assertFtsSchemaCorrect(db: Database.Database): void {
  const row = db
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='messages_fts'",
    )
    .get() as { sql: string } | undefined;

  expect(row, "messages_fts table should exist").toBeDefined();
  expect(
    row?.sql,
    "FTS table definition should contain sentinel column 'message_type'",
  ).toContain("message_type");
}

/** Assert that all three FTS triggers exist and use the 31-column schema. */
function assertTriggersCorrect(db: Database.Database): void {
  for (const name of [
    "messages_fts_insert",
    "messages_fts_delete",
    "messages_fts_update",
  ]) {
    const row = db
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type='trigger' AND name=?",
      )
      .get(name) as { sql: string } | undefined;

    expect(row, `trigger '${name}' should exist`).toBeDefined();
    expect(
      row?.sql,
      `trigger '${name}' should contain sentinel column 'message_type'`,
    ).toContain("message_type");
  }
}

/**
 * Insert `count` minimal ACARS messages into a fully-migrated database.
 * All NOT NULL columns are satisfied; flight numbers are made unique so FTS
 * MATCH queries can target individual rows.
 */
function insertTestMessages(
  db: Database.Database,
  count = 3,
  flightPrefix = "TST",
): void {
  const stmt = db.prepare(`
    INSERT INTO messages (
      uid, message_type, msg_time, station_id,
      toaddr, fromaddr, depa, dsta, eta, gtout, gtin,
      wloff, wlin, lat, lon, alt, msg_text, tail, flight,
      icao, freq, ack, mode, label, block_id, msgno,
      is_response, is_onground, error, libacars, level
    ) VALUES (
      ?, 'ACARS', ?, 'TEST-STATION',
      '', '', 'KJFK', 'KLAX', '', '', '',
      '', '', '40.64', '-73.78', '35000',
      'Test ACARS message', 'N12345', ?,
      'A1B2C3', '131.550', '', 'A', 'H1', '', '',
      '', '', '', '{}', '-15.0'
    )
  `);

  const insert = db.transaction(() => {
    for (let i = 0; i < count; i++) {
      stmt.run(
        `test-uid-${Date.now()}-${i}`,
        Math.floor(Date.now() / 1000) - i,
        `${flightPrefix}${String(i + 1).padStart(3, "0")}`,
      );
    }
  });

  insert();
}

// ---------------------------------------------------------------------------
// Suite 1: Startup repair (database already at latest migration version)
// ---------------------------------------------------------------------------

describe("FTS startup repair via verifyAndRepairFtsIfNeeded", () => {
  const DB_PATH = path.join(process.cwd(), "test-fts-startup-repair.db");

  beforeEach(() => {
    if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
    // Produce a clean, fully-migrated database as the baseline.
    runMigrations(DB_PATH);
  });

  afterEach(() => {
    if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
  });

  // -------------------------------------------------------------------------

  test("skips repair when FTS schema and triggers are already correct", () => {
    // Capture the FTS table sql and insert-trigger sql BEFORE the second run.
    const db = new Database(DB_PATH);
    const ftsBefore = db
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='messages_fts'",
      )
      .get() as { sql: string };
    const trigBefore = db
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type='trigger' AND name='messages_fts_insert'",
      )
      .get() as { sql: string };
    db.close();

    // Second runMigrations — no migration is pending, FTS check should be a no-op.
    runMigrations(DB_PATH);

    const db2 = new Database(DB_PATH);
    const ftsAfter = db2
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='messages_fts'",
      )
      .get() as { sql: string };
    const trigAfter = db2
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type='trigger' AND name='messages_fts_insert'",
      )
      .get() as { sql: string };
    db2.close();

    // Schema must be byte-for-byte identical — no rebuild occurred.
    expect(ftsAfter.sql).toBe(ftsBefore.sql);
    expect(trigAfter.sql).toBe(trigBefore.sql);
  });

  // -------------------------------------------------------------------------

  test("repairs 8-column FTS table on already-migrated database", () => {
    // Degrade to the legacy 8-column schema.
    const db = new Database(DB_PATH);
    installLegacyFts(db);
    db.close();

    // Verify degraded state before repair.
    const dbCheck = new Database(DB_PATH);
    const staleSql = dbCheck
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='messages_fts'",
      )
      .get() as { sql: string };
    dbCheck.close();
    expect(staleSql.sql).not.toContain("message_type");

    // Repair fires inside runMigrations.
    runMigrations(DB_PATH);

    const db2 = new Database(DB_PATH);
    assertFtsSchemaCorrect(db2);
    assertTriggersCorrect(db2);
    db2.close();
  });

  // -------------------------------------------------------------------------

  test("repairs missing triggers on already-migrated database", () => {
    // Drop all three triggers, leave the FTS table itself intact.
    const db = new Database(DB_PATH);
    db.exec("DROP TRIGGER IF EXISTS messages_fts_insert");
    db.exec("DROP TRIGGER IF EXISTS messages_fts_delete");
    db.exec("DROP TRIGGER IF EXISTS messages_fts_update");
    db.close();

    runMigrations(DB_PATH);

    const db2 = new Database(DB_PATH);
    assertTriggersCorrect(db2);
    db2.close();
  });

  // -------------------------------------------------------------------------

  test("repairs old 8-column triggers even when FTS table schema is correct", () => {
    // Replace the correct triggers with the legacy 8-column versions only.
    // The FTS virtual table itself remains the 31-column schema, so
    // isFtsSchemaCorrect() passes but areFtsTriggersCorrect() fails.
    const db = new Database(DB_PATH);
    installLegacyTriggersOnly(db);
    db.close();

    runMigrations(DB_PATH);

    const db2 = new Database(DB_PATH);
    // FTS table should be unchanged (still 31-column) …
    assertFtsSchemaCorrect(db2);
    // … and triggers must now have been replaced with the correct ones.
    assertTriggersCorrect(db2);
    db2.close();
  });

  // -------------------------------------------------------------------------

  test("repaired FTS is searchable for existing messages", () => {
    // Insert real messages, degrade to legacy FTS.
    const db = new Database(DB_PATH);
    insertTestMessages(db, 3, "UAL");
    installLegacyFts(db);
    db.close();

    runMigrations(DB_PATH);

    const db2 = new Database(DB_PATH);
    // The FTS rebuild from the messages table should make existing rows findable.
    const results = db2
      .prepare(
        "SELECT rowid FROM messages_fts WHERE messages_fts MATCH 'flight:UAL001'",
      )
      .all() as Array<{ rowid: number }>;

    expect(results.length).toBeGreaterThan(0);
    db2.close();
  });

  // -------------------------------------------------------------------------

  test("FTS rebuild removes ghost entries that cause the count/messages mismatch", () => {
    // This reproduces the exact bug that manifested as
    // "Found 6 results in 0.001s" with no cards displayed.
    //
    // Setup: install the legacy FTS table WITHOUT any triggers so we can
    // plant a ghost entry (a rowid that has no corresponding messages row).
    const db = new Database(DB_PATH);
    dropFts(db);
    db.exec(LEGACY_FTS_TABLE_SQL);
    // No triggers — normal message INSERTs will NOT populate FTS.

    // Plant a ghost FTS entry pointing to message id 99999, which does not
    // and will never exist in the messages table.
    db.exec(
      "INSERT INTO messages_fts (rowid, depa, dsta, msg_text, tail, flight, icao, freq, label)" +
        " VALUES (99999, '', '', 'ghost message', '', 'GHOST1', '', '', '')",
    );
    db.close();

    // Pre-condition: the ghost entry is visible via FTS MATCH but has no
    // backing row in messages.
    const dbPre = new Database(DB_PATH);
    const ghostBefore = dbPre
      .prepare(
        "SELECT COUNT(*) as c FROM messages_fts WHERE messages_fts MATCH 'flight:GHOST1'",
      )
      .get() as { c: number };
    const msgRow = dbPre
      .prepare("SELECT COUNT(*) as c FROM messages WHERE id = 99999")
      .get() as { c: number };
    dbPre.close();

    expect(ghostBefore.c).toBe(1); // Ghost exists in FTS index …
    expect(msgRow.c).toBe(0); // … but not in messages table

    // Repair: runMigrations detects stale FTS, drops it, rebuilds from messages.
    runMigrations(DB_PATH);

    // Post-condition: ghost entry must be gone; FTS only reflects messages rows.
    const db2 = new Database(DB_PATH);
    const ghostAfter = db2
      .prepare(
        "SELECT COUNT(*) as c FROM messages_fts WHERE messages_fts MATCH 'flight:GHOST1'",
      )
      .get() as { c: number };

    // FTS count must equal the actual messages count (no phantom results).
    const ftsTotal = db2
      .prepare("SELECT COUNT(*) as c FROM messages_fts")
      .get() as { c: number };
    const msgTotal = db2
      .prepare("SELECT COUNT(*) as c FROM messages")
      .get() as { c: number };

    db2.close();

    expect(ghostAfter.c).toBe(0);
    expect(ftsTotal.c).toBe(msgTotal.c);
  });
});

// ---------------------------------------------------------------------------
// Suite 2: migration04 FTS creation / repair path
//
// These tests exercise the path where the database is ENTERING migration04
// for the first time (alembic_version = a589d271a0a4, i.e. migration03).
// ---------------------------------------------------------------------------

describe("migration04 FTS creation and repair", () => {
  const DB_PATH = path.join(process.cwd(), "test-fts-migration04.db");

  /**
   * Construct the minimal database state that a legacy user would have just
   * before migration04 runs: the messages table WITHOUT uid/aircraft_id, the
   * 8-column FTS from the pre-Alembic upgrade_db.py, all auxiliary tables,
   * and alembic_version stamped at migration03.
   */
  function setupPreMigration04State(db: Database.Database): void {
    // messages table — pre-uid, pre-aircraft_id schema
    db.exec(`
      CREATE TABLE messages (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        message_type VARCHAR(32) NOT NULL,
        msg_time     INTEGER     NOT NULL,
        station_id   VARCHAR(32) NOT NULL,
        toaddr       VARCHAR(32) NOT NULL,
        fromaddr     VARCHAR(32) NOT NULL,
        depa         VARCHAR(32) NOT NULL,
        dsta         VARCHAR(32) NOT NULL,
        eta          VARCHAR(32) NOT NULL,
        gtout        VARCHAR(32) NOT NULL,
        gtin         VARCHAR(32) NOT NULL,
        wloff        VARCHAR(32) NOT NULL,
        wlin         VARCHAR(32) NOT NULL,
        lat          VARCHAR(32) NOT NULL,
        lon          VARCHAR(32) NOT NULL,
        alt          VARCHAR(32) NOT NULL,
        msg_text     TEXT        NOT NULL,
        tail         VARCHAR(32) NOT NULL,
        flight       VARCHAR(32) NOT NULL,
        icao         VARCHAR(32) NOT NULL,
        freq         VARCHAR(32) NOT NULL,
        ack          VARCHAR(32) NOT NULL,
        mode         VARCHAR(32) NOT NULL,
        label        VARCHAR(32) NOT NULL,
        block_id     VARCHAR(32) NOT NULL,
        msgno        VARCHAR(32) NOT NULL,
        is_response  VARCHAR(32) NOT NULL,
        is_onground  VARCHAR(32) NOT NULL,
        error        VARCHAR(32) NOT NULL,
        libacars     TEXT        NOT NULL,
        level        VARCHAR(32) NOT NULL
      )
    `);

    // Auxiliary tables that exist at migration03
    db.exec(`
      CREATE TABLE count (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        total INTEGER,
        errors INTEGER,
        good INTEGER
      );
      CREATE TABLE nonlogged_count (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        errors INTEGER,
        good INTEGER
      );
      CREATE TABLE alert_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        term VARCHAR(32),
        count INTEGER
      );
      CREATE TABLE ignore_alert_terms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        term VARCHAR(32)
      );
      CREATE TABLE level_acars  (id INTEGER PRIMARY KEY AUTOINCREMENT, level REAL, count INTEGER);
      CREATE TABLE level_vdlm2  (id INTEGER PRIMARY KEY AUTOINCREMENT, level REAL, count INTEGER);
      CREATE TABLE level_hfdl   (id INTEGER PRIMARY KEY AUTOINCREMENT, level REAL, count INTEGER);
      CREATE TABLE level_imsl   (id INTEGER PRIMARY KEY AUTOINCREMENT, level REAL, count INTEGER);
      CREATE TABLE level_irdm   (id INTEGER PRIMARY KEY AUTOINCREMENT, level REAL, count INTEGER);
      CREATE TABLE freqs_acars  (id INTEGER PRIMARY KEY AUTOINCREMENT, freq TEXT, count INTEGER);
      CREATE TABLE freqs_vdlm2  (id INTEGER PRIMARY KEY AUTOINCREMENT, freq TEXT, count INTEGER);
      CREATE TABLE freqs_hfdl   (id INTEGER PRIMARY KEY AUTOINCREMENT, freq TEXT, count INTEGER);
      CREATE TABLE freqs_imsl   (id INTEGER PRIMARY KEY AUTOINCREMENT, freq TEXT, count INTEGER);
      CREATE TABLE freqs_irdm   (id INTEGER PRIMARY KEY AUTOINCREMENT, freq TEXT, count INTEGER);
    `);

    // Legacy 8-column FTS — the schema that both Alembic and the TypeScript
    // migration04 used to silently skip.
    db.exec(LEGACY_FTS_TABLE_SQL);
    db.exec(LEGACY_TRIGGER_INSERT);
    db.exec(LEGACY_TRIGGER_DELETE);
    db.exec(LEGACY_TRIGGER_UPDATE);

    // Insert a few messages so the FTS rebuild has content to verify against.
    const stmt = db.prepare(`
      INSERT INTO messages (
        message_type, msg_time, station_id,
        toaddr, fromaddr, depa, dsta, eta, gtout, gtin,
        wloff, wlin, lat, lon, alt, msg_text, tail, flight,
        icao, freq, ack, mode, label, block_id, msgno,
        is_response, is_onground, error, libacars, level
      ) VALUES (
        'ACARS', ?, 'STATION',
        '', '', 'KJFK', 'KLAX', '', '', '',
        '', '', '40.64', '-73.78', '35000',
        'Test message', 'N12345', ?,
        'A1B2C3', '131.550', '', 'A', 'H1', '', '',
        '', '', '', '{}', '-15.0'
      )
    `);

    const ins = db.transaction(() => {
      for (let i = 0; i < 5; i++) {
        stmt.run(
          Math.floor(Date.now() / 1000) - i,
          `MIG${String(i + 1).padStart(3, "0")}`,
        );
      }
    });
    ins();

    // Stamp the alembic_version at migration03 — the last migration before FTS.
    db.exec(
      "CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL)",
    );
    db.exec("INSERT INTO alembic_version VALUES ('a589d271a0a4')");
  }

  beforeEach(() => {
    if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
  });

  afterEach(() => {
    if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
  });

  // -------------------------------------------------------------------------

  test("rebuilds 8-column FTS when migration04 runs against legacy database", () => {
    const db = new Database(DB_PATH);
    setupPreMigration04State(db);
    db.close();

    runMigrations(DB_PATH);

    const db2 = new Database(DB_PATH);
    assertFtsSchemaCorrect(db2);
    assertTriggersCorrect(db2);
    db2.close();
  });

  // -------------------------------------------------------------------------

  test("migration04 does not rebuild FTS when correct schema already present", () => {
    // Create the pre-migration04 state but with the CORRECT 31-column FTS
    // already in place (simulates a user who somehow got the right schema
    // before migration04 ran).
    const db = new Database(DB_PATH);
    setupPreMigration04State(db);

    // Replace the legacy FTS with the correct 31-column version.
    dropFts(db);
    db.exec(`
      CREATE VIRTUAL TABLE messages_fts USING fts5(
        message_type UNINDEXED, msg_time, station_id UNINDEXED,
        toaddr UNINDEXED, fromaddr UNINDEXED, depa, dsta,
        eta UNINDEXED, gtout UNINDEXED, gtin UNINDEXED,
        wloff UNINDEXED, wlin UNINDEXED, lat UNINDEXED, lon UNINDEXED,
        alt UNINDEXED, msg_text, tail, flight, icao, freq,
        ack UNINDEXED, mode UNINDEXED, label,
        block_id UNINDEXED, msgno UNINDEXED,
        is_response UNINDEXED, is_onground UNINDEXED,
        error UNINDEXED, libacars UNINDEXED, level UNINDEXED,
        content=messages, content_rowid=id
      )
    `);
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
          new.depa, new.dsta, new.eta, new.gtout, new.gtin, new.wloff, new.wlin,
          new.lat, new.lon, new.alt, new.msg_text, new.tail, new.flight, new.icao,
          new.freq, new.ack, new.mode, new.label, new.block_id, new.msgno,
          new.is_response, new.is_onground, new.error, new.libacars, new.level
        );
      END
    `);
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
          old.depa, old.dsta, old.eta, old.gtout, old.gtin, old.wloff, old.wlin,
          old.lat, old.lon, old.alt, old.msg_text, old.tail, old.flight, old.icao,
          old.freq, old.ack, old.mode, old.label, old.block_id, old.msgno,
          old.is_response, old.is_onground, old.error, old.libacars, old.level
        );
      END
    `);
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
          old.depa, old.dsta, old.eta, old.gtout, old.gtin, old.wloff, old.wlin,
          old.lat, old.lon, old.alt, old.msg_text, old.tail, old.flight, old.icao,
          old.freq, old.ack, old.mode, old.label, old.block_id, old.msgno,
          old.is_response, old.is_onground, old.error, old.libacars, old.level
        );
        INSERT INTO messages_fts (
          rowid, message_type, msg_time, station_id, toaddr, fromaddr,
          depa, dsta, eta, gtout, gtin, wloff, wlin, lat, lon, alt,
          msg_text, tail, flight, icao, freq, ack, mode, label,
          block_id, msgno, is_response, is_onground, error, libacars, level
        ) VALUES (
          new.id, new.message_type, new.msg_time, new.station_id, new.toaddr, new.fromaddr,
          new.depa, new.dsta, new.eta, new.gtout, new.gtin, new.wloff, new.wlin,
          new.lat, new.lon, new.alt, new.msg_text, new.tail, new.flight, new.icao,
          new.freq, new.ack, new.mode, new.label, new.block_id, new.msgno,
          new.is_response, new.is_onground, new.error, new.libacars, new.level
        );
      END
    `);
    db.exec("INSERT INTO messages_fts(messages_fts) VALUES ('rebuild')");

    // Capture the schema text BEFORE migration04 runs.
    const ftsSqlBefore = db
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='messages_fts'",
      )
      .get() as { sql: string };
    db.close();

    runMigrations(DB_PATH);

    const db2 = new Database(DB_PATH);
    const ftsSqlAfter = db2
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='messages_fts'",
      )
      .get() as { sql: string };
    db2.close();

    // The FTS table definition must be unchanged — migration04 skipped it.
    expect(ftsSqlAfter.sql).toBe(ftsSqlBefore.sql);
  });

  // -------------------------------------------------------------------------

  test("FTS is searchable after migration04 rebuilds legacy schema", () => {
    const db = new Database(DB_PATH);
    setupPreMigration04State(db);
    db.close();

    runMigrations(DB_PATH);

    // Messages inserted by setupPreMigration04State used flight numbers MIG001–MIG005.
    // After the rebuild those should be findable via the 31-column FTS index.
    const db2 = new Database(DB_PATH);
    const results = db2
      .prepare(
        "SELECT rowid FROM messages_fts WHERE messages_fts MATCH 'flight:MIG001'",
      )
      .all() as Array<{ rowid: number }>;
    db2.close();

    expect(results.length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------

  test("final alembic_version is latest after full migration from migration03 state", () => {
    const db = new Database(DB_PATH);
    setupPreMigration04State(db);
    db.close();

    runMigrations(DB_PATH);

    const db2 = new Database(DB_PATH);
    const version = db2
      .prepare("SELECT version_num FROM alembic_version")
      .get() as { version_num: string } | undefined;
    db2.close();

    expect(version?.version_num).toBe("a1b2c3d4e5f6");
  });
});
