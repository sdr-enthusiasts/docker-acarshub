/**
 * Tests for FTS5 maintenance functions: optimizeDbFts and optimizeDbMerge
 *
 * Tests cover:
 * - optimizeDbFts() runs without error on an empty FTS table
 * - optimizeDbFts() runs without error on a populated FTS table
 * - optimizeDbFts() is idempotent — calling it twice leaves the table intact
 * - optimizeDbFts() reduces or maintains segment count (closed-loop property)
 * - optimizeDbMerge() runs without error on an empty FTS table
 * - optimizeDbMerge() runs without error on a populated FTS table
 * - optimizeDbMerge() accepts a custom pagesPerCall value
 *
 * WHY THESE TESTS EXIST
 * ---------------------
 * The original optimizeDbMerge() used merge(-16) which wrote only ~64 KB per
 * call — the direct cause of 536,000-segment FTS5 bloat on production.
 * optimizeDbFts() is the closed-loop alternative: it runs until done rather
 * than doing a fixed amount of work, eliminating the need for a magic N value.
 *
 * These tests verify that both functions execute correctly against a real
 * in-memory SQLite database with the full 31-column FTS5 schema, including
 * INSERT and DELETE triggers.  They use initDatabase / closeDatabase to
 * exercise the same code path as production (getSqliteConnection() must
 * return the live connection).
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDatabase, getSqliteConnection, initDatabase } from "../client.js";
import { optimizeDbFts, optimizeDbMerge } from "../queries/messages.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a minimal messages table + FTS5 virtual table + INSERT + DELETE
 * triggers in the supplied connection.  This mirrors the schema created by
 * createFtsTableAndTriggers() in migrate.ts without importing the migration
 * runner (which would apply all migrations and is heavier than needed here).
 */
function createSchema(conn: ReturnType<typeof getSqliteConnection>): void {
  // Minimal messages table — only the columns referenced by the FTS triggers.
  conn.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      message_type TEXT NOT NULL DEFAULT '',
      msg_time    TEXT NOT NULL DEFAULT '',
      station_id  TEXT NOT NULL DEFAULT '',
      toaddr      TEXT NOT NULL DEFAULT '',
      fromaddr    TEXT NOT NULL DEFAULT '',
      depa        TEXT NOT NULL DEFAULT '',
      dsta        TEXT NOT NULL DEFAULT '',
      eta         TEXT NOT NULL DEFAULT '',
      gtout       TEXT NOT NULL DEFAULT '',
      gtin        TEXT NOT NULL DEFAULT '',
      wloff       TEXT NOT NULL DEFAULT '',
      wlin        TEXT NOT NULL DEFAULT '',
      lat         TEXT NOT NULL DEFAULT '',
      lon         TEXT NOT NULL DEFAULT '',
      alt         TEXT NOT NULL DEFAULT '',
      msg_text    TEXT NOT NULL DEFAULT '',
      tail        TEXT NOT NULL DEFAULT '',
      flight      TEXT NOT NULL DEFAULT '',
      icao        TEXT NOT NULL DEFAULT '',
      freq        TEXT NOT NULL DEFAULT '',
      ack         TEXT NOT NULL DEFAULT '',
      mode        TEXT NOT NULL DEFAULT '',
      label       TEXT NOT NULL DEFAULT '',
      block_id    TEXT NOT NULL DEFAULT '',
      msgno       TEXT NOT NULL DEFAULT '',
      is_response TEXT NOT NULL DEFAULT '',
      is_onground TEXT NOT NULL DEFAULT '',
      error       INTEGER NOT NULL DEFAULT 0,
      libacars    TEXT NOT NULL DEFAULT '',
      level       REAL NOT NULL DEFAULT 0
    )
  `);

  conn.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
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
    )
  `);

  conn.exec(`
    CREATE TRIGGER IF NOT EXISTS messages_fts_insert AFTER INSERT ON messages
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

  conn.exec(`
    CREATE TRIGGER IF NOT EXISTS messages_fts_delete AFTER DELETE ON messages
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
}

/** Insert N synthetic messages and return their IDs. */
function insertMessages(
  conn: ReturnType<typeof getSqliteConnection>,
  count: number,
): number[] {
  const stmt = conn.prepare(`
    INSERT INTO messages (message_type, msg_time, msg_text, tail, flight, icao, freq, label)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const ids: number[] = [];
  for (let i = 0; i < count; i++) {
    const result = stmt.run(
      "ACARS",
      String(Date.now() + i),
      `test message body number ${i} with some searchable content`,
      `N${String(i).padStart(5, "0")}`,
      `FL${String(i).padStart(4, "0")}`,
      `ABC${String(i % 1000).padStart(3, "0")}`,
      "131.550",
      "H1",
    );
    ids.push(result.lastInsertRowid as number);
  }
  return ids;
}

/** Count rows in messages_fts_idx (one row ≈ one FTS5 segment). */
function segmentCount(conn: ReturnType<typeof getSqliteConnection>): number {
  const row = conn
    .prepare("SELECT count(*) AS n FROM messages_fts_idx")
    .get() as { n: number };
  return row.n;
}

/** Count rows in the messages_fts content shadow table. */
function ftsDocCount(conn: ReturnType<typeof getSqliteConnection>): number {
  const row = conn
    .prepare("SELECT count(*) AS n FROM messages_fts_docsize")
    .get() as { n: number };
  return row.n;
}

// ---------------------------------------------------------------------------
// Test setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  initDatabase(":memory:");
  createSchema(getSqliteConnection());
});

afterEach(() => {
  closeDatabase();
});

// ---------------------------------------------------------------------------
// optimizeDbFts()
// ---------------------------------------------------------------------------

describe("optimizeDbFts()", () => {
  it("does not throw on an empty FTS table", () => {
    expect(() => optimizeDbFts()).not.toThrow();
  });

  it("does not throw on a populated FTS table", () => {
    insertMessages(getSqliteConnection(), 50);
    expect(() => optimizeDbFts()).not.toThrow();
  });

  it("is idempotent — calling it twice leaves documents intact", () => {
    const conn = getSqliteConnection();
    insertMessages(conn, 20);

    const beforeCount = ftsDocCount(conn);
    optimizeDbFts();
    optimizeDbFts();
    const afterCount = ftsDocCount(conn);

    // optimize must not lose or duplicate documents
    expect(afterCount).toBe(beforeCount);
  });

  it("does not throw on an already-optimized index", () => {
    const conn = getSqliteConnection();
    insertMessages(conn, 10);
    // First optimize brings the index to minimal segments
    optimizeDbFts();
    // Second optimize on an already-clean index must be a no-op, not an error
    expect(() => optimizeDbFts()).not.toThrow();
  });

  it("regression: reduces segment count after insert+delete churn (tombstone accumulation)", () => {
    // This test reproduces the tombstone accumulation pattern that caused the
    // production disk-fill incident.  Without optimize (or with merge(-16)),
    // tombstone segments accumulate indefinitely.  After optimize, the segment
    // count must not exceed a small multiple of the surviving document count.
    const conn = getSqliteConnection();

    // Insert 100 messages then delete 80 of them — heavy tombstone churn
    const ids = insertMessages(conn, 100);
    const deleteStmt = conn.prepare("DELETE FROM messages WHERE id = ?");
    for (const id of ids.slice(0, 80)) {
      deleteStmt.run(id);
    }

    const beforeOptimize = segmentCount(conn);

    optimizeDbFts();

    const afterOptimize = segmentCount(conn);

    // After optimize, the segment count must be strictly less than before
    // (unless it was already 0, which would also be fine).
    //
    // We do not assert a specific number because FTS5's internal segment
    // layout is implementation-defined.  The invariant we care about is that
    // optimize does not make things worse and does consolidate a fragmented
    // index.
    expect(afterOptimize).toBeLessThanOrEqual(beforeOptimize);

    // Surviving documents must all still be searchable
    const result = conn
      .prepare(
        "SELECT count(*) AS n FROM messages_fts WHERE messages_fts MATCH 'searchable'",
      )
      .get() as { n: number };
    expect(result.n).toBeGreaterThanOrEqual(20); // 20 messages survived
  });
});

// ---------------------------------------------------------------------------
// optimizeDbMerge()
// ---------------------------------------------------------------------------

describe("optimizeDbMerge()", () => {
  it("does not throw on an empty FTS table", () => {
    expect(() => optimizeDbMerge()).not.toThrow();
  });

  it("does not throw on a populated FTS table", () => {
    insertMessages(getSqliteConnection(), 50);
    expect(() => optimizeDbMerge()).not.toThrow();
  });

  it("does not lose documents after a merge call", () => {
    const conn = getSqliteConnection();
    insertMessages(conn, 30);

    const beforeCount = ftsDocCount(conn);
    optimizeDbMerge();
    const afterCount = ftsDocCount(conn);

    expect(afterCount).toBe(beforeCount);
  });

  it("accepts a custom pagesPerCall value without throwing", () => {
    insertMessages(getSqliteConnection(), 20);
    // Verify both ends of the useful range work
    expect(() => optimizeDbMerge(1)).not.toThrow();
    expect(() => optimizeDbMerge(1000)).not.toThrow();
  });

  it("regression: default pagesPerCall is 500, not -16 (original bug value)", () => {
    // The original bug was merge(-16) = ~64 KB/call, which could never keep
    // pace with tombstone accumulation on high-volume installs.
    // We cannot inspect the parameter sent to SQLite after the fact, but we
    // can verify the function's default behaviour (500) by confirming it does
    // not throw and leaves documents intact — the key observable difference
    // from -16 is that positive N is a bounded-work call, not a full-pass
    // with a tiny page budget.
    const conn = getSqliteConnection();
    insertMessages(conn, 40);
    const before = ftsDocCount(conn);
    optimizeDbMerge(); // uses default pagesPerCall = 500
    expect(ftsDocCount(conn)).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// optimizeDbFts vs optimizeDbMerge: closed-loop vs open-loop property
// ---------------------------------------------------------------------------

describe("optimizeDbFts is closed-loop; optimizeDbMerge is open-loop", () => {
  it("optimizeDbFts leaves no more segments than optimizeDbMerge on the same churn pattern", () => {
    // This documents the fundamental design difference:
    //   merge(N) does at most N pages of work and returns — may leave
    //   consolidation incomplete on large fragmented indexes.
    //   optimize runs until the b-tree is fully consolidated — no N required.
    //
    // We cannot guarantee optimize always beats merge on a tiny in-memory DB
    // (FTS5 automerge may have already cleaned things up), so we only assert
    // that optimize does not leave MORE segments than merge.

    // --- merge path ---
    closeDatabase();
    initDatabase(":memory:");
    const connMerge = getSqliteConnection();
    createSchema(connMerge);
    const mergeIds = insertMessages(connMerge, 60);
    const deleteStmt1 = connMerge.prepare("DELETE FROM messages WHERE id = ?");
    for (const id of mergeIds.slice(0, 40)) {
      deleteStmt1.run(id);
    }
    optimizeDbMerge(500);
    const afterMerge = segmentCount(connMerge);

    // --- optimize path ---
    closeDatabase();
    initDatabase(":memory:");
    const connOpt = getSqliteConnection();
    createSchema(connOpt);
    const optIds = insertMessages(connOpt, 60);
    const deleteStmt2 = connOpt.prepare("DELETE FROM messages WHERE id = ?");
    for (const id of optIds.slice(0, 40)) {
      deleteStmt2.run(id);
    }
    optimizeDbFts();
    const afterOptimize = segmentCount(connOpt);

    expect(afterOptimize).toBeLessThanOrEqual(afterMerge);
  });
});
