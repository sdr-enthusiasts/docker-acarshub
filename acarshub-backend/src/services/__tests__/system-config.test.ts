// Copyright (C) 2022-2026 Frederick Clausen II
// This file is part of acarshub <https://github.com/sdr-enthusiasts/docker-acarshub>.
//
// acarshub is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// acarshub is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with acarshub.  If not, see <http://www.gnu.org/licenses/>.

/**
 * system-config.ts — covers the typed key-value wrapper over the
 * `system_config` table.
 *
 * Runs the REAL migration chain against a temp-file SQLite database (not a
 * hand-written CREATE TABLE) because `system_config` is declared
 * `WITHOUT ROWID` in migration16.ts; testing against a lookalike table would
 * validate the wrong shape. `initDatabase(dbPath)` is then used so the
 * service's internal `getDatabase()` calls resolve to this migrated file,
 * mirroring db/__tests__/schema.test.ts.
 *
 * Each test deletes its own rows from `system_config` (via `afterEach`) so
 * the suite is order-independent despite sharing one on-disk database.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

// ---------------------------------------------------------------------------
// Mock the logger so a test can assert on what is logged.
//
// The service must log a config key's LENGTH, never its value. That property
// is otherwise enforced only by author discipline: swapping `valueLength` for
// `value` while debugging would pass every other test in this file. Today's
// keys are low-sensitivity, but this module is the template the rest of v4.3
// will copy, so the property is pinned here rather than left to review.
//
// vi.hoisted() constructs the spies before the (hoisted) vi.mock factory runs.
// `fatal` is included because createLogger's Logger has six methods, and this
// mock also stands in for the loggers inside the real migration runner and DB
// client that this file exercises.
// ---------------------------------------------------------------------------

const loggerMocks = vi.hoisted(() => ({
  trace: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  fatal: vi.fn(),
}));

vi.mock("../../utils/logger.js", () => ({
  createLogger: () => loggerMocks,
}));

import {
  closeDatabase,
  getSqliteConnection,
  initDatabase,
} from "../../db/client.js";
import { runMigrations } from "../../db/migrate.js";
import {
  getSystemConfigValue,
  type SystemConfigKey,
  setSystemConfigValue,
} from "../system-config.js";

let tmpDir: string;
let dbPath: string;

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "acarshub-system-config-"));
  dbPath = join(tmpDir, "test.db");
  runMigrations(dbPath);
  initDatabase(dbPath);
});

afterAll(() => {
  closeDatabase();
  rmSync(tmpDir, { recursive: true, force: true });
});

afterEach(() => {
  // Clean up so tests do not leak rows into each other; the suite shares
  // one on-disk database across all tests in this file.
  getSqliteConnection().exec("DELETE FROM system_config");
});

function countRows(key: string): number {
  const row = getSqliteConnection()
    .prepare("SELECT COUNT(*) AS count FROM system_config WHERE key = ?")
    .get(key) as { count: number };
  return row.count;
}

function readRawUpdatedAt(key: string): number {
  const row = getSqliteConnection()
    .prepare("SELECT updated_at AS updatedAt FROM system_config WHERE key = ?")
    .get(key) as { updatedAt: number };
  return row.updatedAt;
}

describe("getSystemConfigValue / setSystemConfigValue", () => {
  it("round-trips an exact value through set then get", () => {
    setSystemConfigValue("acars_decoder_installed_version", "1.2.3");
    expect(getSystemConfigValue("acars_decoder_installed_version")).toBe(
      "1.2.3",
    );
  });

  it("returns null for a key that was never set, without throwing", () => {
    expect(() =>
      getSystemConfigValue("search_index_rebuild_status"),
    ).not.toThrow();
    expect(getSystemConfigValue("search_index_rebuild_status")).toBeNull();
  });

  it("populates updated_at in Unix seconds within a bounded window on insert", () => {
    const before = Math.floor(Date.now() / 1000);
    setSystemConfigValue("search_index_rebuild_cursor", "0");
    const after = Math.floor(Date.now() / 1000);

    const updatedAt = readRawUpdatedAt("search_index_rebuild_cursor");
    expect(updatedAt).toBeGreaterThanOrEqual(before);
    expect(updatedAt).toBeLessThanOrEqual(after);
  });

  // Note on what this test actually proves: `key` is the PRIMARY KEY, so a
  // regression to a plain INSERT cannot produce two rows — SQLite throws
  // first. The COUNT(*) assertion is therefore guarding against a *swallowed*
  // constraint violation (an upsert replaced by insert-and-ignore) rather than
  // literal duplication, and the value assertion is what proves the second
  // write actually took effect.
  it("replaces an existing key rather than inserting a duplicate row", () => {
    setSystemConfigValue("acars_decoder_installed_version", "1.0.0");
    setSystemConfigValue("acars_decoder_installed_version", "2.0.0");

    expect(getSystemConfigValue("acars_decoder_installed_version")).toBe(
      "2.0.0",
    );
    expect(countRows("acars_decoder_installed_version")).toBe(1);
  });

  it("advances updated_at when overwriting an existing key", () => {
    setSystemConfigValue("search_index_rebuild_status", "running");

    const wayInThePast = 1;
    getSqliteConnection()
      .prepare("UPDATE system_config SET updated_at = ? WHERE key = ?")
      .run(wayInThePast, "search_index_rebuild_status");
    expect(readRawUpdatedAt("search_index_rebuild_status")).toBe(wayInThePast);

    setSystemConfigValue("search_index_rebuild_status", "complete");

    expect(readRawUpdatedAt("search_index_rebuild_status")).toBeGreaterThan(
      wayInThePast,
    );
  });

  it("round-trips an empty-string value as '' rather than null", () => {
    setSystemConfigValue("search_index_rebuild_cursor", "");
    const value = getSystemConfigValue("search_index_rebuild_cursor");
    expect(value).toBe("");
    expect(value).not.toBeNull();
  });

  it("supports every SystemConfigKey member independently", () => {
    const keys: SystemConfigKey[] = [
      "acars_decoder_installed_version",
      "search_index_rebuild_status",
      "search_index_rebuild_cursor",
    ];

    for (const key of keys) {
      const value = `value-for-${key}`;
      setSystemConfigValue(key, value);
      expect(getSystemConfigValue(key)).toBe(value);
    }

    // Confirm each key kept its own independent value rather than the
    // getter/setter silently hardcoding a single key.
    for (const key of keys) {
      expect(getSystemConfigValue(key)).toBe(`value-for-${key}`);
    }
  });

  it("logs the value's length but never the value itself", () => {
    loggerMocks.debug.mockClear();
    const secret = "a-value-that-must-not-be-logged";

    setSystemConfigValue("acars_decoder_installed_version", secret);
    getSystemConfigValue("acars_decoder_installed_version");

    expect(loggerMocks.debug).toHaveBeenCalled();
    for (const [message, meta] of loggerMocks.debug.mock.calls) {
      expect(JSON.stringify({ message, meta })).not.toContain(secret);
      expect(meta).toHaveProperty("valueLength", secret.length);
      expect(meta).not.toHaveProperty("value");
    }
  });

  it("composes with an ambient transaction so a rollback discards the write", () => {
    // Phase 4's search-index rebuild persists its cursor in the same
    // transaction as the batch of rows the cursor accounts for; if the batch
    // rolls back, the cursor must roll back with it, or a crash resumes past
    // work that was never committed.
    //
    // What this catches, verified by mutation: the setter acquiring its own
    // database connection rather than going through getDatabase(). That write
    // commits independently and survives the outer rollback, and this test
    // fails ('2000' instead of '1000').
    //
    // What it deliberately does NOT catch, also verified: wrapping the insert
    // in a nested db.transaction(). better-sqlite3 implements a nested
    // transaction as a SAVEPOINT, so the outer rollback still discards it and
    // the guarantee holds. That refactor is safe, which is why this test is
    // written against the observable rollback guarantee rather than against
    // the statement shape.
    const connection = getSqliteConnection();
    setSystemConfigValue("search_index_rebuild_cursor", "1000");

    const runAndFail = connection.transaction(() => {
      setSystemConfigValue("search_index_rebuild_cursor", "2000");
      throw new Error("batch failed after the cursor was written");
    });

    expect(() => runAndFail()).toThrow("batch failed");
    expect(getSystemConfigValue("search_index_rebuild_cursor")).toBe("1000");
  });
});
