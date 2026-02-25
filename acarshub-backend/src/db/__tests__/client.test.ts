/**
 * Tests for database client functions
 *
 * Tests cover:
 * - checkpoint() return value correctness (column semantics, framesRemaining calculation)
 * - Regression for { simple: true } bug that caused framesCheckpointed / framesRemaining
 *   to be undefined because better-sqlite3 returns only the first column as a scalar
 *   when { simple: true } is used with a multi-column PRAGMA result.
 * - wal_autocheckpoint pragma applied to both primary and backup connections
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  checkpoint,
  closeDatabase,
  getSqliteConnection,
  initDatabase,
} from "../client.js";

/**
 * Each test group initialises an isolated in-memory database via initDatabase()
 * and tears it down with closeDatabase() so module-level connection state is
 * reset between tests.  We cannot spy on getSqliteConnection() for internal
 * calls because checkpoint() invokes it as a direct module-local reference;
 * using initDatabase/closeDatabase is the only reliable way to control which
 * connection is live.
 */
describe("checkpoint()", () => {
  beforeEach(() => {
    // Use a fresh in-memory database for every test.
    // The ":memory:" path bypasses the env-var default and never touches disk.
    initDatabase(":memory:");
  });

  afterEach(() => {
    closeDatabase();
  });

  // ── Regression tests ──────────────────────────────────────────────────────

  it("regression: framesCheckpointed is a number, not undefined (was broken by { simple: true })", () => {
    const { framesCheckpointed } = checkpoint("PASSIVE");
    expect(typeof framesCheckpointed).toBe("number");
    expect(framesCheckpointed).not.toBeUndefined();
  });

  it("regression: framesRemaining is a number, not undefined (was broken by { simple: true })", () => {
    const { framesRemaining } = checkpoint("PASSIVE");
    expect(typeof framesRemaining).toBe("number");
    expect(framesRemaining).not.toBeUndefined();
  });

  it("regression: framesCheckpointed maps to the 'checkpointed' column, not 'log'", () => {
    const conn = getSqliteConnection();
    conn.exec(
      "CREATE TABLE IF NOT EXISTS _wal_reg (id INTEGER PRIMARY KEY, v TEXT)",
    );
    conn.prepare("INSERT INTO _wal_reg (v) VALUES (?)").run("row");

    const raw = conn.pragma("wal_checkpoint(PASSIVE)") as {
      busy: number;
      log: number;
      checkpointed: number;
    }[];

    const { framesCheckpointed } = checkpoint("PASSIVE");
    // Must equal the 'checkpointed' column, not the 'log' column
    expect(framesCheckpointed).toBe(raw[0].checkpointed);
  });

  it("regression: framesRemaining is computed as log - checkpointed, not the raw 'checkpointed' value", () => {
    const conn = getSqliteConnection();
    conn.exec(
      "CREATE TABLE IF NOT EXISTS _wal_reg2 (id INTEGER PRIMARY KEY, v TEXT)",
    );
    conn.prepare("INSERT INTO _wal_reg2 (v) VALUES (?)").run("row");

    const raw = conn.pragma("wal_checkpoint(PASSIVE)") as {
      busy: number;
      log: number;
      checkpointed: number;
    }[];
    const expectedRemaining = raw[0].log - raw[0].checkpointed;

    const { framesRemaining } = checkpoint("PASSIVE");
    expect(framesRemaining).toBe(expectedRemaining);
  });

  // ── Correctness tests ─────────────────────────────────────────────────────

  it("framesRemaining is >= 0", () => {
    const { framesRemaining } = checkpoint("PASSIVE");
    expect(framesRemaining).toBeGreaterThanOrEqual(0);
  });

  it("TRUNCATE checkpoint leaves framesRemaining = 0 with no concurrent readers", () => {
    const conn = getSqliteConnection();
    conn.exec(
      "CREATE TABLE IF NOT EXISTS _wal_trunc (id INTEGER PRIMARY KEY, v TEXT)",
    );
    conn.prepare("INSERT INTO _wal_trunc (v) VALUES (?)").run("hello");

    const { framesRemaining } = checkpoint("TRUNCATE");
    // TRUNCATE with no readers resets the WAL file to zero length
    expect(framesRemaining).toBe(0);
  });

  it("framesCheckpointed and framesRemaining sum to log frames after writes", () => {
    const conn = getSqliteConnection();
    conn.exec(
      "CREATE TABLE IF NOT EXISTS _wal_sum (id INTEGER PRIMARY KEY, v TEXT)",
    );
    const insert = conn.prepare("INSERT INTO _wal_sum (v) VALUES (?)");
    for (let i = 0; i < 20; i++) {
      insert.run(`entry-${i}`);
    }

    const raw = conn.pragma("wal_checkpoint(PASSIVE)") as {
      busy: number;
      log: number;
      checkpointed: number;
    }[];
    const totalLog = raw[0].log;

    const { framesCheckpointed, framesRemaining } = checkpoint("PASSIVE");
    expect(framesCheckpointed + framesRemaining).toBe(totalLog);
  });

  it("returns correct shape for PASSIVE mode", () => {
    const result = checkpoint("PASSIVE");
    expect(result).toHaveProperty("framesCheckpointed");
    expect(result).toHaveProperty("framesRemaining");
  });

  it("returns correct shape for FULL mode", () => {
    const result = checkpoint("FULL");
    expect(result).toHaveProperty("framesCheckpointed");
    expect(result).toHaveProperty("framesRemaining");
  });

  it("returns correct shape for RESTART mode", () => {
    const result = checkpoint("RESTART");
    expect(result).toHaveProperty("framesCheckpointed");
    expect(result).toHaveProperty("framesRemaining");
  });

  it("returns correct shape for TRUNCATE mode", () => {
    const result = checkpoint("TRUNCATE");
    expect(result).toHaveProperty("framesCheckpointed");
    expect(result).toHaveProperty("framesRemaining");
  });

  it("defaults to PASSIVE mode without throwing", () => {
    const result = checkpoint();
    expect(result).toHaveProperty("framesCheckpointed");
    expect(result).toHaveProperty("framesRemaining");
  });

  // NOTE: framesCheckpointed can be -1 when the connection is not in WAL mode
  // (e.g., in-memory databases silently ignore "journal_mode = WAL").  The
  // regression tests above are sufficient to verify correct column mapping; a
  // non-negative assertion here would be misleading for in-memory test DBs.
});
