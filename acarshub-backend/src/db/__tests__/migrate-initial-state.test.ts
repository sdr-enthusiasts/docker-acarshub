/**
 * Test migration from initial Alembic state (e7991f1644b1)
 *
 * This test verifies that databases at the initial Alembic migration state
 * (without alembic_version table) can be correctly migrated to the latest schema.
 *
 * The initial state has:
 * - messages table WITHOUT uid or aircraft_id columns
 * - freqs table (unified, with freq_type column)
 * - level table (unified, WITHOUT decoder column)
 * - messages_fts virtual table (already exists)
 * - count, nonlogged_count, alert_stats, ignore_alert_terms tables
 */

import * as fs from "node:fs";
import * as path from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

// Import the migration function
import { runMigrations } from "../migrate.js";

const TEST_DB_PATH = path.join(process.cwd(), "test-migrate-initial.db");

describe("Migration from initial Alembic state", () => {
  let db: Database.Database;

  beforeEach(() => {
    // Clean up any existing test database
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }

    // Create a database that matches the initial Alembic migration state
    db = new Database(TEST_DB_PATH);

    // Create messages table (without uid or aircraft_id)
    db.exec(`
      CREATE TABLE messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_type VARCHAR(32) NOT NULL,
        msg_time INTEGER NOT NULL,
        station_id VARCHAR(32) NOT NULL,
        toaddr VARCHAR(32) NOT NULL,
        fromaddr VARCHAR(32) NOT NULL,
        depa VARCHAR(32) NOT NULL,
        dsta VARCHAR(32) NOT NULL,
        eta VARCHAR(32) NOT NULL,
        gtout VARCHAR(32) NOT NULL,
        gtin VARCHAR(32) NOT NULL,
        wloff VARCHAR(32) NOT NULL,
        wlin VARCHAR(32) NOT NULL,
        lat VARCHAR(32) NOT NULL,
        lon VARCHAR(32) NOT NULL,
        alt VARCHAR(32) NOT NULL,
        msg_text TEXT NOT NULL,
        tail VARCHAR(32) NOT NULL,
        flight VARCHAR(32) NOT NULL,
        icao VARCHAR(32) NOT NULL,
        freq VARCHAR(32) NOT NULL,
        ack VARCHAR(32) NOT NULL,
        mode VARCHAR(32) NOT NULL,
        label VARCHAR(32) NOT NULL,
        block_id VARCHAR(32) NOT NULL,
        msgno VARCHAR(32) NOT NULL,
        is_response VARCHAR(32) NOT NULL,
        is_onground VARCHAR(32) NOT NULL,
        error VARCHAR(32) NOT NULL,
        libacars TEXT NOT NULL,
        level VARCHAR(32) NOT NULL
      );
    `);

    // Create unified freqs table with freq_type column
    db.exec(`
      CREATE TABLE freqs (
        it INTEGER PRIMARY KEY AUTOINCREMENT,
        freq VARCHAR(32),
        freq_type VARCHAR(32),
        count INTEGER
      );
    `);

    // Create unified level table WITHOUT decoder column
    db.exec(`
      CREATE TABLE level (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        level INTEGER,
        count INTEGER
      );
    `);

    // Create other tables
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

      CREATE TABLE messages_saved (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_type VARCHAR(32) NOT NULL,
        msg_time INTEGER NOT NULL,
        station_id VARCHAR(32) NOT NULL,
        toaddr VARCHAR(32) NOT NULL,
        fromaddr VARCHAR(32) NOT NULL,
        depa VARCHAR(32) NOT NULL,
        dsta VARCHAR(32) NOT NULL,
        eta VARCHAR(32) NOT NULL,
        gtout VARCHAR(32) NOT NULL,
        gtin VARCHAR(32) NOT NULL,
        wloff VARCHAR(32) NOT NULL,
        wlin VARCHAR(32) NOT NULL,
        lat VARCHAR(32) NOT NULL,
        lon VARCHAR(32) NOT NULL,
        alt VARCHAR(32) NOT NULL,
        msg_text TEXT NOT NULL,
        tail VARCHAR(32) NOT NULL,
        flight VARCHAR(32) NOT NULL,
        icao VARCHAR(32) NOT NULL,
        freq VARCHAR(32) NOT NULL,
        ack VARCHAR(32) NOT NULL,
        mode VARCHAR(32) NOT NULL,
        label VARCHAR(32) NOT NULL,
        block_id VARCHAR(32) NOT NULL,
        msgno VARCHAR(32) NOT NULL,
        is_response VARCHAR(32) NOT NULL,
        is_onground VARCHAR(32) NOT NULL,
        error VARCHAR(32) NOT NULL,
        libacars TEXT NOT NULL,
        level VARCHAR(32) NOT NULL,
        term VARCHAR(32) NOT NULL,
        type_of_match VARCHAR(32) NOT NULL
      );
    `);

    // Create FTS table (already exists in initial state)
    db.exec(`
      CREATE VIRTUAL TABLE messages_fts USING fts5(
        depa, dsta, msg_text, tail, flight, icao, freq, label,
        content=messages,
        content_rowid=id
      );

      CREATE TRIGGER messages_fts_insert AFTER INSERT ON messages
      BEGIN
        INSERT INTO messages_fts (rowid, depa, dsta, msg_text, tail, flight, icao, freq, label)
        VALUES (new.id, new.depa, new.dsta, new.msg_text, new.tail, new.flight, new.icao, new.freq, new.label);
      END;

      CREATE TRIGGER messages_fts_delete AFTER DELETE ON messages
      BEGIN
        INSERT INTO messages_fts (messages_fts, rowid, depa, dsta, msg_text, tail, flight, icao, freq, label)
        VALUES ('delete', old.id, old.depa, old.dsta, old.msg_text, old.tail, old.flight, old.icao, old.freq, old.label);
      END;

      CREATE TRIGGER messages_fts_update AFTER UPDATE ON messages
      BEGIN
        INSERT INTO messages_fts (messages_fts, rowid, depa, dsta, msg_text, tail, flight, icao, freq, label)
        VALUES ('delete', old.id, old.depa, old.dsta, old.msg_text, old.tail, old.flight, old.icao, old.freq, old.label);
        INSERT INTO messages_fts (rowid, depa, dsta, msg_text, tail, flight, icao, freq, label)
        VALUES (new.id, new.depa, new.dsta, new.msg_text, new.tail, new.flight, new.icao, new.freq, new.label);
      END;
    `);

    // Insert sample data
    const insertMsg = db.prepare(`
      INSERT INTO messages (
        message_type, msg_time, station_id, toaddr, fromaddr,
        depa, dsta, eta, gtout, gtin, wloff, wlin, lat, lon, alt,
        msg_text, tail, flight, icao, freq, ack, mode, label,
        block_id, msgno, is_response, is_onground, error, libacars, level
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Insert ACARS messages
    for (let i = 0; i < 10; i++) {
      insertMsg.run(
        "ACARS",
        Date.now() - i * 1000,
        "test-station",
        "ADDR1",
        "ADDR2",
        "KJFK",
        "KLAX",
        "",
        "",
        "",
        "",
        "",
        "40.6413",
        "-73.7781",
        "35000",
        "Test ACARS message",
        "N12345",
        "UAL123",
        "A12345",
        "131.550",
        "",
        "",
        "H1",
        "",
        "",
        "",
        "",
        "",
        "{}",
        "-15.5",
      );
    }

    // Insert VDL-M2 messages
    for (let i = 0; i < 15; i++) {
      insertMsg.run(
        "VDL-M2",
        Date.now() - i * 1000,
        "test-station",
        "ADDR1",
        "ADDR2",
        "EGLL",
        "LFPG",
        "",
        "",
        "",
        "",
        "",
        "51.4700",
        "-0.4543",
        "28000",
        "Test VDL-M2 message",
        "G-ABCD",
        "BAW456",
        "400ABC",
        "136.975",
        "",
        "",
        "H1",
        "",
        "",
        "",
        "",
        "",
        "{}",
        "-18.2",
      );
    }

    // Insert HFDL messages
    for (let i = 0; i < 8; i++) {
      insertMsg.run(
        "HFDL",
        Date.now() - i * 1000,
        "test-station",
        "ADDR1",
        "ADDR2",
        "YSSY",
        "NZAA",
        "",
        "",
        "",
        "",
        "",
        "-33.9461",
        "151.1772",
        "41000",
        "Test HFDL message",
        "VH-XYZ",
        "QFA789",
        "7C1234",
        "21.9340",
        "",
        "",
        "H1",
        "",
        "",
        "",
        "",
        "",
        "{}",
        "-22.1",
      );
    }

    // Insert freqs data (with freq_type column)
    const insertFreq = db.prepare(
      "INSERT INTO freqs (freq, freq_type, count) VALUES (?, ?, ?)",
    );
    insertFreq.run("131.550", "ACARS", 100);
    insertFreq.run("136.975", "VDL-M2", 150);
    insertFreq.run("21.9340", "HFDL", 80);

    // Insert level data (WITHOUT decoder column)
    const insertLevel = db.prepare(
      "INSERT INTO level (level, count) VALUES (?, ?)",
    );
    insertLevel.run(-15, 50);
    insertLevel.run(-18, 70);
    insertLevel.run(-22, 40);

    db.close();
  });

  afterEach(() => {
    // Clean up test database
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
  });

  test("should detect initial Alembic migration state", () => {
    // Run migrations with test database path
    runMigrations(TEST_DB_PATH);

    // Verify migration completed
    const testDb = new Database(TEST_DB_PATH);

    // Check alembic_version table exists and is at latest version
    const version = testDb
      .prepare("SELECT version_num FROM alembic_version")
      .get() as { version_num: string } | undefined;

    expect(version).toBeDefined();
    expect(version?.version_num).toBe("b6c7d8e9f0a1");

    testDb.close();
  });

  test("should create split level tables and rebuild data from messages", () => {
    runMigrations(TEST_DB_PATH);

    const testDb = new Database(TEST_DB_PATH);

    // Check that split level tables exist
    const tables = testDb
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'level_%'",
      )
      .all() as Array<{ name: string }>;

    const tableNames = tables.map((t) => t.name).sort();
    expect(tableNames).toEqual([
      "level_acars",
      "level_hfdl",
      "level_imsl",
      "level_irdm",
      "level_vdlm2",
    ]);

    // Check that data was rebuilt from messages
    const acarsCount = testDb
      .prepare("SELECT COUNT(*) as count FROM level_acars")
      .get() as { count: number };
    const vdlm2Count = testDb
      .prepare("SELECT COUNT(*) as count FROM level_vdlm2")
      .get() as { count: number };
    const hfdlCount = testDb
      .prepare("SELECT COUNT(*) as count FROM level_hfdl")
      .get() as { count: number };

    // We inserted 10 ACARS, 15 VDL-M2, and 8 HFDL messages
    // Each should have 1 unique level value, so we expect:
    expect(acarsCount.count).toBeGreaterThan(0);
    expect(vdlm2Count.count).toBeGreaterThan(0);
    expect(hfdlCount.count).toBeGreaterThan(0);

    // Check that old level table is gone
    const oldLevel = testDb
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='level'",
      )
      .get();
    expect(oldLevel).toBeUndefined();

    testDb.close();
  });

  test("should create split freqs tables and migrate data", () => {
    runMigrations(TEST_DB_PATH);

    const testDb = new Database(TEST_DB_PATH);

    // Check that split freqs tables exist
    const tables = testDb
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'freqs_%'",
      )
      .all() as Array<{ name: string }>;

    const tableNames = tables.map((t) => t.name).sort();
    expect(tableNames).toEqual([
      "freqs_acars",
      "freqs_hfdl",
      "freqs_imsl",
      "freqs_irdm",
      "freqs_vdlm2",
    ]);

    // Check that data was migrated correctly
    const acarsFreqs = testDb
      .prepare("SELECT * FROM freqs_acars")
      .all() as Array<{ freq: string; count: number }>;
    const vdlm2Freqs = testDb
      .prepare("SELECT * FROM freqs_vdlm2")
      .all() as Array<{ freq: string; count: number }>;
    const hfdlFreqs = testDb
      .prepare("SELECT * FROM freqs_hfdl")
      .all() as Array<{ freq: string; count: number }>;

    expect(acarsFreqs).toHaveLength(1);
    expect(acarsFreqs[0]?.freq).toBe("131.550");
    expect(acarsFreqs[0]?.count).toBe(100);

    expect(vdlm2Freqs).toHaveLength(1);
    expect(vdlm2Freqs[0]?.freq).toBe("136.975");
    expect(vdlm2Freqs[0]?.count).toBe(150);

    expect(hfdlFreqs).toHaveLength(1);
    expect(hfdlFreqs[0]?.freq).toBe("21.9340");
    expect(hfdlFreqs[0]?.count).toBe(80);

    // Check that old freqs table is gone
    const oldFreqs = testDb
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='freqs'",
      )
      .get();
    expect(oldFreqs).toBeUndefined();

    testDb.close();
  });

  test("should add uid column and generate UIDs for existing messages", () => {
    runMigrations(TEST_DB_PATH);

    const testDb = new Database(TEST_DB_PATH);

    // Check that uid column exists
    const columns = testDb
      .prepare("PRAGMA table_info(messages)")
      .all() as Array<{ name: string }>;
    const hasUid = columns.some((col) => col.name === "uid");
    expect(hasUid).toBe(true);

    // Check that all messages have UIDs
    const totalMessages = testDb
      .prepare("SELECT COUNT(*) as count FROM messages")
      .get() as { count: number };
    const messagesWithUid = testDb
      .prepare("SELECT COUNT(*) as count FROM messages WHERE uid IS NOT NULL")
      .get() as { count: number };

    expect(messagesWithUid.count).toBe(totalMessages.count);
    expect(totalMessages.count).toBe(33); // 10 + 15 + 8

    testDb.close();
  });

  test("should add aircraft_id column", () => {
    runMigrations(TEST_DB_PATH);

    const testDb = new Database(TEST_DB_PATH);

    // Check that aircraft_id column exists
    const columns = testDb
      .prepare("PRAGMA table_info(messages)")
      .all() as Array<{ name: string }>;
    const hasAircraftId = columns.some((col) => col.name === "aircraft_id");
    expect(hasAircraftId).toBe(true);

    testDb.close();
  });

  test("should create alert_matches table and drop messages_saved", () => {
    runMigrations(TEST_DB_PATH);

    const testDb = new Database(TEST_DB_PATH);

    // Check that alert_matches exists
    const alertMatches = testDb
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='alert_matches'",
      )
      .get();
    expect(alertMatches).toBeDefined();

    // Check that messages_saved is gone
    const messagesSaved = testDb
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='messages_saved'",
      )
      .get();
    expect(messagesSaved).toBeUndefined();

    testDb.close();
  });

  test("should create composite indexes", () => {
    runMigrations(TEST_DB_PATH);

    const testDb = new Database(TEST_DB_PATH);

    // Check for composite indexes
    const indexes = testDb
      .prepare("SELECT name FROM sqlite_master WHERE type='index'")
      .all() as Array<{ name: string }>;

    const indexNames = indexes.map((idx) => idx.name);

    expect(indexNames).toContain("ix_messages_time_icao");
    expect(indexNames).toContain("ix_messages_tail_flight");
    expect(indexNames).toContain("ix_messages_depa_dsta");
    expect(indexNames).toContain("ix_messages_type_time");
    expect(indexNames).toContain("ix_alert_matches_term_time");
    expect(indexNames).toContain("ix_alert_matches_uid_term");

    testDb.close();
  });

  test("should create timeseries_stats table", () => {
    runMigrations(TEST_DB_PATH);

    const testDb = new Database(TEST_DB_PATH);

    // Check that timeseries_stats table exists
    const table = testDb
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='timeseries_stats'",
      )
      .get();

    expect(table).toBeDefined();

    // Check that table has correct columns
    const columns = testDb
      .prepare("PRAGMA table_info(timeseries_stats)")
      .all() as Array<{ name: string }>;

    const columnNames = columns.map((col) => col.name);
    // After migration 12: timestamp is INTEGER PRIMARY KEY, id and resolution
    // columns have been removed along with both old indexes.
    expect(columnNames).toContain("timestamp");
    expect(columnNames).toContain("acars_count");
    expect(columnNames).toContain("vdlm_count");
    expect(columnNames).toContain("hfdl_count");
    expect(columnNames).toContain("imsl_count");
    expect(columnNames).toContain("irdm_count");
    expect(columnNames).toContain("total_count");
    expect(columnNames).toContain("error_count");
    expect(columnNames).not.toContain("id");
    expect(columnNames).not.toContain("resolution");

    // idx_timeseries_timestamp_resolution and idx_timeseries_resolution must
    // have been dropped by migration 12 (timestamp is now the PK B-tree).
    const indexes = testDb
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='timeseries_stats'",
      )
      .all() as Array<{ name: string }>;

    const indexNames = indexes.map((idx) => idx.name);
    expect(indexNames).not.toContain("idx_timeseries_timestamp_resolution");
    expect(indexNames).not.toContain("idx_timeseries_resolution");

    testDb.close();
  });

  // ---------------------------------------------------------------------------
  // Migration 11: deduplicate_timeseries_and_add_registry
  // ---------------------------------------------------------------------------

  test("should create rrd_import_registry table after migration 11", () => {
    runMigrations(TEST_DB_PATH);

    const testDb = new Database(TEST_DB_PATH);

    const table = testDb
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='rrd_import_registry'",
      )
      .get();

    expect(table).toBeDefined();

    const columns = testDb
      .prepare("PRAGMA table_info(rrd_import_registry)")
      .all() as Array<{ name: string }>;

    const columnNames = columns.map((col) => col.name);
    expect(columnNames).toContain("id");
    expect(columnNames).toContain("file_hash");
    expect(columnNames).toContain("rrd_path");
    expect(columnNames).toContain("imported_at");
    expect(columnNames).toContain("rows_imported");

    // Unique index on file_hash must exist
    const indexes = testDb
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='rrd_import_registry'",
      )
      .all() as Array<{ name: string }>;

    const indexNames = indexes.map((idx) => idx.name);
    expect(indexNames).toContain("idx_rrd_import_registry_hash");

    testDb.close();
  });

  test("should enforce timestamp uniqueness via PRIMARY KEY after migration 12", () => {
    runMigrations(TEST_DB_PATH);

    const testDb = new Database(TEST_DB_PATH);

    // After migration 12, timestamp is the INTEGER PRIMARY KEY — duplicate
    // timestamps must be rejected regardless of any other column value.
    testDb.exec(`
      INSERT INTO timeseries_stats
        (timestamp, acars_count, vdlm_count, hfdl_count,
         imsl_count, irdm_count, total_count, error_count)
      VALUES (1704067200, 1, 0, 0, 0, 0, 1, 0)
    `);

    expect(() => {
      testDb.exec(`
        INSERT INTO timeseries_stats
          (timestamp, acars_count, vdlm_count, hfdl_count,
           imsl_count, irdm_count, total_count, error_count)
        VALUES (1704067200, 2, 0, 0, 0, 0, 2, 0)
      `);
    }).toThrow(/UNIQUE constraint failed/);

    // A different timestamp must be accepted.
    expect(() => {
      testDb.exec(`
        INSERT INTO timeseries_stats
          (timestamp, acars_count, vdlm_count, hfdl_count,
           imsl_count, irdm_count, total_count, error_count)
        VALUES (1704067260, 1, 0, 0, 0, 0, 1, 0)
      `);
    }).not.toThrow();

    testDb.close();
  });

  test("migration 11 removes duplicate timeseries rows keeping highest id", () => {
    // Simulate a database that has already gone through migration 10 but has
    // duplicate timeseries rows (as would happen from a double-import).
    // We apply migrations up to 10 manually, insert duplicates, then run
    // migration 11 via runMigrations and verify the duplicates are gone.

    // Build the DB at the pre-migration-11 state by running migrations
    // and then manually downgrading the alembic version back one step so
    // runMigrations will re-apply only migration 11.
    //
    // Easier approach: create a DB at the migration-10 state from scratch.
    const setupDb = new Database(TEST_DB_PATH);
    setupDb.exec(`
      CREATE TABLE alembic_version (version_num VARCHAR(32) PRIMARY KEY NOT NULL);
      INSERT INTO alembic_version VALUES ('c3d4e5f6a1b2');
    `);
    // Simulate a DB at migration-10 state (the last migration before
    // deduplication + registry).  Migration 11 will deduplicate; migration 12
    // will then rebuild the table with timestamp as INTEGER PRIMARY KEY.
    setupDb.exec(`
      CREATE TABLE timeseries_stats (
        id            INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        timestamp     INTEGER NOT NULL,
        resolution    TEXT    NOT NULL,
        acars_count   INTEGER DEFAULT 0 NOT NULL,
        vdlm_count    INTEGER DEFAULT 0 NOT NULL,
        hfdl_count    INTEGER DEFAULT 0 NOT NULL,
        imsl_count    INTEGER DEFAULT 0 NOT NULL,
        irdm_count    INTEGER DEFAULT 0 NOT NULL,
        total_count   INTEGER DEFAULT 0 NOT NULL,
        error_count   INTEGER DEFAULT 0 NOT NULL
      );
      CREATE INDEX idx_timeseries_timestamp_resolution
        ON timeseries_stats (timestamp, resolution);
      CREATE INDEX idx_timeseries_resolution
        ON timeseries_stats (resolution);
    `);

    // Insert three rows for the same slot (simulating two extra imports)
    // and one clean row for a different slot.
    setupDb.exec(`
      INSERT INTO timeseries_stats
        (timestamp, resolution, acars_count, vdlm_count, hfdl_count,
         imsl_count, irdm_count, total_count, error_count)
      VALUES
        (1704067200, '1min', 1, 0, 0, 0, 0, 1, 0),
        (1704067200, '1min', 1, 0, 0, 0, 0, 1, 0),
        (1704067200, '1min', 1, 0, 0, 0, 0, 1, 0),
        (1704067260, '1min', 2, 0, 0, 0, 0, 2, 0);
    `);

    // Verify duplicates exist before migration
    const beforeCount = (
      setupDb
        .prepare("SELECT COUNT(*) AS n FROM timeseries_stats")
        .get() as { n: number }
    ).n;
    expect(beforeCount).toBe(4); // 3 dupes + 1 clean

    setupDb.close();

    // Now run migrations — only migration 11 should apply
    runMigrations(TEST_DB_PATH);

    const testDb = new Database(TEST_DB_PATH);

    // After migrations 11 + 12: only 2 rows must remain (one per unique
    // timestamp), and the schema must have been rebuilt.
    const afterCount = (
      testDb
        .prepare("SELECT COUNT(*) AS n FROM timeseries_stats")
        .get() as { n: number }
    ).n;
    expect(afterCount).toBe(2);

    // After migration 12 the `id` and `resolution` columns are gone.
    const columns = testDb
      .prepare("PRAGMA table_info(timeseries_stats)")
      .all() as Array<{ name: string }>;
    const columnNames = columns.map((c) => c.name);
    expect(columnNames).not.toContain("id");
    expect(columnNames).not.toContain("resolution");
    expect(columnNames).toContain("timestamp");

    // Both surviving timestamps must be present.
    const ts1 = testDb
      .prepare("SELECT timestamp FROM timeseries_stats WHERE timestamp = 1704067200")
      .get() as { timestamp: number } | undefined;
    expect(ts1).toBeDefined();

    const ts2 = testDb
      .prepare("SELECT timestamp FROM timeseries_stats WHERE timestamp = 1704067260")
      .get() as { timestamp: number } | undefined;
    expect(ts2).toBeDefined();

    // rrd_import_registry must also have been created by migration 11.
    const registryTable = testDb
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='rrd_import_registry'",
      )
      .get();
    expect(registryTable).toBeDefined();

    testDb.close();
  });

  // ---------------------------------------------------------------------------
  // Migration 12: drop_resolution_promote_timestamp_pk
  // ---------------------------------------------------------------------------

  test("migration 12 rebuilds timeseries_stats with timestamp as INTEGER PRIMARY KEY", () => {
    runMigrations(TEST_DB_PATH);

    const testDb = new Database(TEST_DB_PATH);

    // timestamp must be the only primary-key column (pk=1 in PRAGMA table_info)
    const columns = testDb
      .prepare("PRAGMA table_info(timeseries_stats)")
      .all() as Array<{ name: string; pk: number }>;

    const pkColumns = columns.filter((c) => c.pk > 0).map((c) => c.name);
    expect(pkColumns).toEqual(["timestamp"]);

    // id and resolution must not exist.
    const columnNames = columns.map((c) => c.name);
    expect(columnNames).not.toContain("id");
    expect(columnNames).not.toContain("resolution");

    // All payload columns must be present.
    for (const col of [
      "acars_count",
      "vdlm_count",
      "hfdl_count",
      "imsl_count",
      "irdm_count",
      "total_count",
      "error_count",
    ]) {
      expect(columnNames).toContain(col);
    }

    // Both old indexes must have been dropped.
    const indexes = testDb
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='timeseries_stats'",
      )
      .all() as Array<{ name: string }>;
    const indexNames = indexes.map((i) => i.name);
    expect(indexNames).not.toContain("idx_timeseries_timestamp_resolution");
    expect(indexNames).not.toContain("idx_timeseries_resolution");

    testDb.close();
  });

  test("regression: migration 12 preserves existing rows when upgrading from migration 11 state", () => {
    // Simulate a DB that is already at migration-11 state (post-dedup,
    // UNIQUE index on (timestamp, resolution), but still has id/resolution).
    const setupDb = new Database(TEST_DB_PATH);
    setupDb.exec(`
      CREATE TABLE alembic_version (version_num VARCHAR(32) PRIMARY KEY NOT NULL);
      INSERT INTO alembic_version VALUES ('f0a1b2c3d4e5');
    `);
    setupDb.exec(`
      CREATE TABLE timeseries_stats (
        id            INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        timestamp     INTEGER NOT NULL,
        resolution    TEXT    NOT NULL DEFAULT '1min',
        acars_count   INTEGER DEFAULT 0 NOT NULL,
        vdlm_count    INTEGER DEFAULT 0 NOT NULL,
        hfdl_count    INTEGER DEFAULT 0 NOT NULL,
        imsl_count    INTEGER DEFAULT 0 NOT NULL,
        irdm_count    INTEGER DEFAULT 0 NOT NULL,
        total_count   INTEGER DEFAULT 0 NOT NULL,
        error_count   INTEGER DEFAULT 0 NOT NULL
      );
      CREATE UNIQUE INDEX idx_timeseries_timestamp_resolution
        ON timeseries_stats (timestamp, resolution);
      CREATE INDEX idx_timeseries_resolution
        ON timeseries_stats (resolution);
    `);
    setupDb.exec(`
      CREATE TABLE rrd_import_registry (
        id          INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        file_hash   TEXT    NOT NULL UNIQUE,
        rrd_path    TEXT    NOT NULL,
        imported_at INTEGER NOT NULL,
        rows_imported INTEGER NOT NULL DEFAULT 0
      );
      CREATE UNIQUE INDEX idx_rrd_import_registry_hash
        ON rrd_import_registry (file_hash);
    `);
    setupDb.exec(`
      INSERT INTO timeseries_stats
        (timestamp, resolution, acars_count, vdlm_count, hfdl_count,
         imsl_count, irdm_count, total_count, error_count)
      VALUES
        (1704067200, '1min', 10, 5, 3, 1, 0, 19, 0),
        (1704067260, '1min',  8, 4, 2, 0, 1, 15, 0),
        (1704067320, '1min',  6, 3, 1, 0, 0, 10, 1);
    `);
    setupDb.close();

    // Apply only migration 12.
    runMigrations(TEST_DB_PATH);

    const testDb = new Database(TEST_DB_PATH);

    // All 3 rows must have survived the rebuild.
    const rowCount = (
      testDb
        .prepare("SELECT COUNT(*) AS n FROM timeseries_stats")
        .get() as { n: number }
    ).n;
    expect(rowCount).toBe(3);

    // Spot-check that payload data was preserved correctly.
    const row = testDb
      .prepare("SELECT * FROM timeseries_stats WHERE timestamp = 1704067200")
      .get() as Record<string, number> | undefined;

    expect(row).toBeDefined();
    expect(row?.acars_count).toBe(10);
    expect(row?.vdlm_count).toBe(5);
    expect(row?.total_count).toBe(19);

    testDb.close();
  });

  test("regression: migration 12 keeps '1min' row when same timestamp exists under two resolutions", () => {
    // Edge case: a DB at migration-11 state where the same timestamp appears
    // under both '1min' and '5min' resolution (possible if RRD expansion was
    // run multiple times with different archive configs, or if data was
    // manually inserted). Migration 12 must keep the '1min' row.
    const setupDb = new Database(TEST_DB_PATH);
    setupDb.exec(`
      CREATE TABLE alembic_version (version_num VARCHAR(32) PRIMARY KEY NOT NULL);
      INSERT INTO alembic_version VALUES ('f0a1b2c3d4e5');
    `);
    setupDb.exec(`
      CREATE TABLE timeseries_stats (
        id            INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        timestamp     INTEGER NOT NULL,
        resolution    TEXT    NOT NULL,
        acars_count   INTEGER DEFAULT 0 NOT NULL,
        vdlm_count    INTEGER DEFAULT 0 NOT NULL,
        hfdl_count    INTEGER DEFAULT 0 NOT NULL,
        imsl_count    INTEGER DEFAULT 0 NOT NULL,
        irdm_count    INTEGER DEFAULT 0 NOT NULL,
        total_count   INTEGER DEFAULT 0 NOT NULL,
        error_count   INTEGER DEFAULT 0 NOT NULL
      );
      CREATE UNIQUE INDEX idx_timeseries_timestamp_resolution
        ON timeseries_stats (timestamp, resolution);
      CREATE INDEX idx_timeseries_resolution
        ON timeseries_stats (resolution);
    `);
    setupDb.exec(`
      CREATE TABLE rrd_import_registry (
        id          INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        file_hash   TEXT    NOT NULL UNIQUE,
        rrd_path    TEXT    NOT NULL,
        imported_at INTEGER NOT NULL,
        rows_imported INTEGER NOT NULL DEFAULT 0
      );
      CREATE UNIQUE INDEX idx_rrd_import_registry_hash
        ON rrd_import_registry (file_hash);
    `);
    // Same timestamp with '1min' (acars=42) and '5min' (acars=7).
    // Migration 12 must keep acars=42 (the '1min' row).
    setupDb.exec(`
      INSERT INTO timeseries_stats
        (timestamp, resolution, acars_count, total_count)
      VALUES
        (1704067200, '1min',  42, 42),
        (1704067200, '5min',   7,  7);
    `);
    setupDb.close();

    runMigrations(TEST_DB_PATH);

    const testDb = new Database(TEST_DB_PATH);

    // Only one row per timestamp after rebuild.
    const rowCount = (
      testDb
        .prepare("SELECT COUNT(*) AS n FROM timeseries_stats")
        .get() as { n: number }
    ).n;
    expect(rowCount).toBe(1);

    const row = testDb
      .prepare("SELECT * FROM timeseries_stats WHERE timestamp = 1704067200")
      .get() as Record<string, number> | undefined;

    expect(row).toBeDefined();
    // The '1min' row (acars=42) must have won.
    expect(row?.acars_count).toBe(42);

    testDb.close();
  });
});
