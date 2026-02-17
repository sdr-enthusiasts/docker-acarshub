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
    expect(version?.version_num).toBe("a1b2c3d4e5f6");

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
    expect(columnNames).toContain("id");
    expect(columnNames).toContain("timestamp");
    expect(columnNames).toContain("resolution");
    expect(columnNames).toContain("acars_count");
    expect(columnNames).toContain("vdlm_count");
    expect(columnNames).toContain("hfdl_count");
    expect(columnNames).toContain("imsl_count");
    expect(columnNames).toContain("irdm_count");
    expect(columnNames).toContain("total_count");
    expect(columnNames).toContain("error_count");
    expect(columnNames).toContain("created_at");

    // Check that indexes exist
    const indexes = testDb
      .prepare("SELECT name FROM sqlite_master WHERE type='index'")
      .all() as Array<{ name: string }>;

    const indexNames = indexes.map((idx) => idx.name);
    expect(indexNames).toContain("idx_timeseries_timestamp_resolution");
    expect(indexNames).toContain("idx_timeseries_resolution");

    testDb.close();
  });
});
