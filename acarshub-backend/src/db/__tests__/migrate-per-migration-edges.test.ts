/**
 * Edge-case branches inside individual migration step functions that
 * existing migrate-* tests don't reach because they all start from the
 * canonical initial-Alembic-state fixture with a single freq_type set,
 * empty messages, and no pre-existing later-migration tables.
 *
 * Branches under test:
 *   migration02 L406-409 — IMSL and IRDM freq_type rows route to imsl/irdm.
 *   migration11 L828-829 — timeseries_stats already exists, skip create.
 *
 * Unreachable branches (documented, not tested):
 *   migration01 L225-226 — messages table exists on a fresh-but-not-empty DB.
 *     Only reachable by hand-surgery; corruption guard fires from userland.
 *   migration02 L417 — freqs source table absent.  Only reachable if a DB
 *     was alembic-stamped at migration01 without legacy freqs, which the
 *     migration01 path never produces.  Defensive dead code from userland.
 *   migration03 L664-665 — actual ICAO-to-hex UPDATE.  Guarded by the
 *     regex `/^[0-9a-f]+$/i` against the first non-empty icao value.
 *     Any decimal-stored-as-string also satisfies that regex (decimal
 *     digits are a subset of hex digits), so the guard treats every
 *     plausible legacy decimal icao as "already hex" and skips.  The
 *     UPDATE only fires for icao values containing characters outside
 *     `[0-9a-fA-F]` that also CAST to a positive integer — a state the
 *     pre-Drizzle codepath never produced.  Effectively dead from
 *     userland.
 *
 * Strategy: build the canonical initial-Alembic-state fixture (a database
 * shape that predates the Drizzle migration framework) with extra seed
 * rows or pre-existing later-migration tables to drive the target branch,
 * then run runMigrations end-to-end and assert on the resulting state.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runMigrations } from "../migrate.js";

const TEST_DB_PATH = path.join(
  process.cwd(),
  `test-migrate-per-mig-${process.pid}.db`,
);

function cleanup(): void {
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const p = TEST_DB_PATH + suffix;
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
    }
  }
}

/**
 * Build the canonical initial-Alembic-state fixture: the exact schema
 * shape a pre-Drizzle ACARS Hub database had after Python-side Alembic
 * stamping was completed but before any TypeScript-side migration ran.
 *
 * Mirrors the schema used by `migrate-initial-state.test.ts` —
 * intentionally duplicated to keep this file self-contained.  If a
 * third test needs the same fixture, extract to a shared helper module.
 *
 * @param extra Optional callback that runs after the canonical schema
 *   is in place but before the database is closed.  Use to seed extra
 *   rows or pre-create later-migration tables.
 */
function buildInitialState(extra?: (db: Database.Database) => void): void {
  const db = new Database(TEST_DB_PATH);

  // messages table (without uid or aircraft_id — those come from later migrations).
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

    CREATE TABLE freqs (
      it INTEGER PRIMARY KEY AUTOINCREMENT,
      freq VARCHAR(32),
      freq_type VARCHAR(32),
      count INTEGER
    );

    CREATE TABLE level (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      level INTEGER,
      count INTEGER
    );

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

  if (extra) extra(db);
  db.close();
}

describe("Per-migration edge-case branches", () => {
  beforeEach(() => {
    cleanup();
  });

  afterEach(() => {
    cleanup();
  });

  it("migration02: routes IMSL and IRDM freq_type rows into imsl/irdm split tables", () => {
    // The split-freqs migration has a switch on freq_type that branches
    // for ACARS, VDL-M2/VDLM2, HFDL, IMSL, and IRDM.  Other migrate-* tests
    // only seed ACARS/VDL-M2/HFDL, leaving the IMSL/IRDM cases uncovered.
    // Seed all five so every branch in the routing switch fires.
    buildInitialState((db) => {
      const insertFreq = db.prepare(
        "INSERT INTO freqs (freq, freq_type, count) VALUES (?, ?, ?)",
      );
      insertFreq.run("131.550", "ACARS", 100);
      insertFreq.run("136.975", "VDL-M2", 150);
      insertFreq.run("21.9340", "HFDL", 80);
      insertFreq.run("1626.5", "IMSL", 7);
      insertFreq.run("1612.0", "IRDM", 3);
    });

    runMigrations(TEST_DB_PATH);

    const db = new Database(TEST_DB_PATH);
    const imslRow = db
      .prepare("SELECT freq, count FROM freqs_imsl WHERE freq = ?")
      .get("1626.5") as { freq: string; count: number } | undefined;
    const irdmRow = db
      .prepare("SELECT freq, count FROM freqs_irdm WHERE freq = ?")
      .get("1612.0") as { freq: string; count: number } | undefined;
    db.close();

    expect(imslRow?.count).toBe(7);
    expect(irdmRow?.count).toBe(3);
  });

  it("migration11: skips timeseries_stats creation when table already exists", () => {
    // The migration11 idempotency branch returns early if timeseries_stats
    // already exists.  Driving it from userland requires running the full
    // canonical chain (migrations 01..10) on a DB that already has the
    // target table pre-created so migration11 sees it and skips its
    // CREATE statement.  The pre-existing shape must include every column
    // migration12 will SELECT from it during its rebuild step.
    buildInitialState((db) => {
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

    // Migration should complete without throwing — the early-return
    // branch absorbs what would otherwise be a duplicate-CREATE error.
    expect(() => runMigrations(TEST_DB_PATH)).not.toThrow();

    const dbAfter = new Database(TEST_DB_PATH);
    const exists = dbAfter
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='timeseries_stats'",
      )
      .get();
    dbAfter.close();
    expect(exists).toBeTruthy();
  });
});
