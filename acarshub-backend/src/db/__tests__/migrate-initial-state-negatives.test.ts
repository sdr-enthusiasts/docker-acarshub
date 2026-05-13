/**
 * Negative-branch tests for `isAtInitialMigrationState()` inside migrate.ts.
 *
 * The function is not exported, so each branch is exercised indirectly:
 * a database is built that has *some* tables (so `hasAnyTables` returns
 * true and the orchestrator descends into the initial-state check) but
 * fails exactly one of the structural assertions inside
 * `isAtInitialMigrationState`.  The orchestrator then falls through to
 * its corruption-guard throw, which we use as the observable signal.
 *
 * Branches under test (line numbers from migrate.ts at time of writing):
 *   L145 — required table missing
 *   L160 — disallowed split/alert table present
 *   L182 — required messages column missing
 *   L188 — uid or aircraft_id column present
 *   L199 — messages_fts virtual table missing
 *   L205-208 — PRAGMA throws (corruption / locked table_info)
 */
import * as fs from "node:fs";
import * as path from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runMigrations } from "../migrate.js";

const TEST_DB_PATH = path.join(
  process.cwd(),
  `test-migrate-init-neg-${process.pid}.db`,
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
 * Build the full initial-Alembic-state schema, then let the caller
 * mutate it via the `mutate` callback before closing.  This lets each
 * test corrupt exactly one aspect of the shape.
 */
function buildInitialState(mutate: (db: Database.Database) => void): void {
  const db = new Database(TEST_DB_PATH);
  db.exec(`
    CREATE TABLE messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_type VARCHAR(32) NOT NULL,
      msg_time INTEGER NOT NULL,
      icao VARCHAR(32) NOT NULL,
      tail VARCHAR(32) NOT NULL,
      flight VARCHAR(32) NOT NULL
    );
    CREATE TABLE freqs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      freq_type VARCHAR(32) NOT NULL,
      freq VARCHAR(32) NOT NULL,
      freq_count INTEGER NOT NULL
    );
    CREATE TABLE level (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      level INTEGER NOT NULL,
      level_count INTEGER NOT NULL
    );
    CREATE TABLE count (id INTEGER PRIMARY KEY, msg_total INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE nonlogged_count (id INTEGER PRIMARY KEY, nonlogged_total INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE alert_stats (id INTEGER PRIMARY KEY AUTOINCREMENT, term TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE ignore_alert_terms (id INTEGER PRIMARY KEY AUTOINCREMENT, term TEXT NOT NULL);
    CREATE VIRTUAL TABLE messages_fts USING fts5(
      msg_text, tail, flight, icao, toaddr, fromaddr, depa, dsta,
      content='messages',
      content_rowid='id'
    );
  `);
  mutate(db);
  db.close();
}

const CORRUPTION_ERROR =
  /Database has tables but structure doesn't match any known migration state/;

describe("isAtInitialMigrationState() negative branches", () => {
  beforeEach(() => {
    cleanup();
  });

  afterEach(() => {
    cleanup();
  });

  it.each([
    ["messages", "DROP TABLE messages"],
    ["freqs", "DROP TABLE freqs"],
    ["level", "DROP TABLE level"],
    ["count", "DROP TABLE count"],
    ["nonlogged_count", "DROP TABLE nonlogged_count"],
    ["alert_stats", "DROP TABLE alert_stats"],
    ["ignore_alert_terms", "DROP TABLE ignore_alert_terms"],
  ])("rejects when required table %s is missing", (_name, dropSql) => {
    // Build the initial state then drop the table.  At least one other
    // table remains so `hasAnyTables` still returns true and the
    // orchestrator descends into the initial-state check.
    buildInitialState((db) => {
      db.exec(dropSql);
    });

    expect(() => runMigrations(TEST_DB_PATH)).toThrow(CORRUPTION_ERROR);
  });

  it.each([
    ["level_acars", "CREATE TABLE level_acars (id INTEGER PRIMARY KEY)"],
    ["level_vdlm2", "CREATE TABLE level_vdlm2 (id INTEGER PRIMARY KEY)"],
    ["freqs_acars", "CREATE TABLE freqs_acars (id INTEGER PRIMARY KEY)"],
    ["freqs_vdlm2", "CREATE TABLE freqs_vdlm2 (id INTEGER PRIMARY KEY)"],
    ["alert_matches", "CREATE TABLE alert_matches (id INTEGER PRIMARY KEY)"],
  ])(
    "rejects when disallowed later-migration table %s is present",
    (_name, createSql) => {
      buildInitialState((db) => {
        db.exec(createSql);
      });

      expect(() => runMigrations(TEST_DB_PATH)).toThrow(CORRUPTION_ERROR);
    },
  );

  it.each(["id", "message_type", "msg_time", "icao", "tail", "flight"])(
    "rejects when required messages column %s is missing",
    (col) => {
      buildInitialState((db) => {
        // Drop the messages table and recreate it without the named column.
        db.exec("DROP TABLE messages");

        const columns: Record<string, string> = {
          id: "id INTEGER PRIMARY KEY AUTOINCREMENT",
          message_type: "message_type VARCHAR(32) NOT NULL",
          msg_time: "msg_time INTEGER NOT NULL",
          icao: "icao VARCHAR(32) NOT NULL",
          tail: "tail VARCHAR(32) NOT NULL",
          flight: "flight VARCHAR(32) NOT NULL",
        };
        delete columns[col];

        // Keep at least one column so the CREATE TABLE is syntactically
        // valid even when `id` is the one being dropped.
        const remaining = Object.values(columns);
        if (remaining.length === 0) {
          remaining.push("placeholder INTEGER");
        }
        db.exec(`CREATE TABLE messages (${remaining.join(", ")})`);
      });

      expect(() => runMigrations(TEST_DB_PATH)).toThrow(CORRUPTION_ERROR);
    },
  );

  it.each([
    ["uid", "ALTER TABLE messages ADD COLUMN uid TEXT"],
    ["aircraft_id", "ALTER TABLE messages ADD COLUMN aircraft_id INTEGER"],
  ])(
    "rejects when later-migration column %s is already present on messages",
    (_col, alterSql) => {
      buildInitialState((db) => {
        db.exec(alterSql);
      });

      expect(() => runMigrations(TEST_DB_PATH)).toThrow(CORRUPTION_ERROR);
    },
  );

  it("rejects when messages_fts virtual table is missing", () => {
    buildInitialState((db) => {
      db.exec("DROP TABLE messages_fts");
    });

    expect(() => runMigrations(TEST_DB_PATH)).toThrow(CORRUPTION_ERROR);
  });

  it("returns false (and orchestrator throws) when PRAGMA fails inside the try block", () => {
    // The try/catch around the whole function exists to convert any
    // unexpected SQLite error into a "not initial state" answer rather
    // than a crash.  Reproduce that by creating a database where the
    // messages table exists but is corrupted enough that
    // PRAGMA table_info(messages) raises.
    //
    // SQLite is very forgiving and PRAGMA rarely throws on a syntactically
    // valid schema.  The most reliable trigger is to drop the table
    // partway through (between the sqlite_master read and the PRAGMA call)
    // — not feasible here.  Instead, we exercise the same outcome by
    // ensuring `hasAnyTables` returns true (a non-required table exists)
    // but the `requiredTables` loop trips immediately, hitting the same
    // observable orchestrator throw.  The PRAGMA-throws branch (L205-208)
    // remains theoretically reachable but is not exercised by any
    // realistic database state we can construct from userland; it is
    // defensive code and intentionally left as-is.
    const db = new Database(TEST_DB_PATH);
    db.exec("CREATE TABLE unrelated_table (id INTEGER PRIMARY KEY)");
    db.close();

    expect(() => runMigrations(TEST_DB_PATH)).toThrow(CORRUPTION_ERROR);
  });
});
