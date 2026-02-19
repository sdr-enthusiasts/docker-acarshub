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
 * Unit tests for stats-pruning service
 *
 * Tests cover:
 * - pruneOldStats: deletes rows older than retention period, keeps recent rows
 * - TIMESERIES_RETENTION_DAYS env var: custom period, invalid value falls back to default
 * - VACUUM: only triggered when > 10,000 rows deleted
 * - Error handling: database errors are re-thrown
 */

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as clientModule from "../../db/client.js";
import * as schema from "../../db/schema.js";
import { timeseriesStats } from "../../db/schema.js";
import { pruneOldStats } from "../stats-pruning.js";

// ---------------------------------------------------------------------------
// Schema SQL for timeseries_stats (mirrors Drizzle schema)
// ---------------------------------------------------------------------------

const CREATE_TIMESERIES_TABLE = `
  CREATE TABLE IF NOT EXISTS timeseries_stats (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp   INTEGER NOT NULL,
    resolution  TEXT    NOT NULL,
    acars_count INTEGER NOT NULL DEFAULT 0,
    vdlm_count  INTEGER NOT NULL DEFAULT 0,
    hfdl_count  INTEGER NOT NULL DEFAULT 0,
    imsl_count  INTEGER NOT NULL DEFAULT 0,
    irdm_count  INTEGER NOT NULL DEFAULT 0,
    total_count INTEGER NOT NULL DEFAULT 0,
    error_count INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL DEFAULT 0
  );
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Current Unix timestamp in seconds */
function now(): number {
  return Math.floor(Date.now() / 1000);
}

/** Seconds for N days */
function days(n: number): number {
  return n * 86400;
}

/** Insert a single timeseries row at a given Unix-second timestamp */
function insertRow(
  db: ReturnType<typeof drizzle<typeof schema>>,
  timestamp: number,
  resolution = "1min",
): void {
  db.insert(timeseriesStats)
    .values({
      timestamp,
      resolution: resolution as "1min" | "5min" | "1hour" | "6hour",
      acarsCount: 1,
      vdlmCount: 0,
      hfdlCount: 0,
      imslCount: 0,
      irdmCount: 0,
      totalCount: 1,
      errorCount: 0,
      createdAt: Date.now(),
    })
    .run();
}

/** Count all rows in timeseries_stats */
function countRows(db: ReturnType<typeof drizzle<typeof schema>>): number {
  const result = db.select().from(timeseriesStats).all();
  return result.length;
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let sqliteDb: Database.Database;
let testDb: ReturnType<typeof drizzle<typeof schema>>;

beforeEach(() => {
  // Fresh in-memory database for every test
  sqliteDb = new Database(":memory:");
  sqliteDb.exec(CREATE_TIMESERIES_TABLE);
  testDb = drizzle(sqliteDb, { schema });

  vi.spyOn(clientModule, "getDatabase").mockReturnValue(testDb);
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.TIMESERIES_RETENTION_DAYS;
  sqliteDb.close();
});

// ---------------------------------------------------------------------------
// pruneOldStats — basic deletion logic
// ---------------------------------------------------------------------------

describe("pruneOldStats", () => {
  it("should delete rows older than the default retention period (3 years)", async () => {
    const threeYearsAndOneDayAgo = now() - days(1096);
    const oneDayAgo = now() - days(1);

    insertRow(testDb, threeYearsAndOneDayAgo); // should be deleted
    insertRow(testDb, oneDayAgo); // should be kept

    expect(countRows(testDb)).toBe(2);

    await pruneOldStats();

    expect(countRows(testDb)).toBe(1);
    const remaining = testDb.select().from(timeseriesStats).all();
    expect(remaining[0].timestamp).toBe(oneDayAgo);
  });

  it("should keep rows exactly at the retention boundary", async () => {
    // A row timestamped exactly at the cutoff should be kept (>= cutoff)
    const exactlyThreeYearsAgo = now() - days(1095);

    insertRow(testDb, exactlyThreeYearsAgo);
    expect(countRows(testDb)).toBe(1);

    await pruneOldStats();

    // The cutoff is: now() - 1095 * 86400.  A row at exactly that timestamp
    // has timestamp >= cutoff, so the WHERE (timestamp < cutoff) does NOT match.
    expect(countRows(testDb)).toBe(1);
  });

  it("should delete multiple old rows", async () => {
    for (let i = 1100; i <= 1110; i++) {
      insertRow(testDb, now() - days(i));
    }
    // 3 recent rows
    insertRow(testDb, now() - days(1));
    insertRow(testDb, now() - days(2));
    insertRow(testDb, now() - days(3));

    expect(countRows(testDb)).toBe(14);

    await pruneOldStats();

    expect(countRows(testDb)).toBe(3);
  });

  it("should not delete anything when all rows are within retention window", async () => {
    insertRow(testDb, now() - days(1));
    insertRow(testDb, now() - days(30));
    insertRow(testDb, now() - days(365));

    expect(countRows(testDb)).toBe(3);

    await pruneOldStats();

    expect(countRows(testDb)).toBe(3);
  });

  it("should handle an empty table without error", async () => {
    expect(countRows(testDb)).toBe(0);
    await expect(pruneOldStats()).resolves.toBeUndefined();
    expect(countRows(testDb)).toBe(0);
  });

  it("should work with multiple resolutions", async () => {
    const oldTs = now() - days(1100);
    const newTs = now() - days(1);

    insertRow(testDb, oldTs, "1min");
    insertRow(testDb, oldTs, "5min");
    insertRow(testDb, oldTs, "1hour");
    insertRow(testDb, oldTs, "6hour");
    insertRow(testDb, newTs, "1min");

    expect(countRows(testDb)).toBe(5);

    await pruneOldStats();

    expect(countRows(testDb)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// pruneOldStats — TIMESERIES_RETENTION_DAYS env var
// ---------------------------------------------------------------------------

describe("pruneOldStats — TIMESERIES_RETENTION_DAYS env var", () => {
  it("should use custom retention period from env var", async () => {
    process.env.TIMESERIES_RETENTION_DAYS = "7";

    // 8 days old — should be deleted under 7-day retention
    insertRow(testDb, now() - days(8));
    // 6 days old — should be kept
    insertRow(testDb, now() - days(6));

    expect(countRows(testDb)).toBe(2);

    await pruneOldStats();

    expect(countRows(testDb)).toBe(1);
    const remaining = testDb.select().from(timeseriesStats).all();
    expect(remaining[0].timestamp).toBeGreaterThanOrEqual(now() - days(7));
  });

  it("should keep data beyond 3-year default when retention is extended", async () => {
    process.env.TIMESERIES_RETENTION_DAYS = "2000";

    // 1800 days old — normally deleted under 3-year default, kept under 2000-day
    insertRow(testDb, now() - days(1800));
    insertRow(testDb, now() - days(1));

    await pruneOldStats();

    expect(countRows(testDb)).toBe(2);
  });

  it("should fall back to 3-year default for a non-numeric env value", async () => {
    process.env.TIMESERIES_RETENTION_DAYS = "not-a-number";

    // Row just over 3 years old — should be deleted using default
    insertRow(testDb, now() - days(1096));
    // Row 1 day old — should be kept
    insertRow(testDb, now() - days(1));

    await pruneOldStats();

    expect(countRows(testDb)).toBe(1);
  });

  it("should fall back to 3-year default for zero retention days", async () => {
    process.env.TIMESERIES_RETENTION_DAYS = "0";

    insertRow(testDb, now() - days(1096));
    insertRow(testDb, now() - days(1));

    await pruneOldStats();

    expect(countRows(testDb)).toBe(1);
  });

  it("should fall back to 3-year default for negative retention days", async () => {
    process.env.TIMESERIES_RETENTION_DAYS = "-30";

    insertRow(testDb, now() - days(1096));
    insertRow(testDb, now() - days(1));

    await pruneOldStats();

    expect(countRows(testDb)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// pruneOldStats — VACUUM threshold
// ---------------------------------------------------------------------------

describe("pruneOldStats — VACUUM threshold", () => {
  it("should NOT run VACUUM when fewer than 10,001 rows are deleted", async () => {
    // Spy on the Drizzle db.run method (testDb.run) since better-sqlite3's
    // Database instance has no .run() — VACUUM goes through Drizzle's run().
    const vacuumSpy = vi.spyOn(testDb, "run");

    // Insert 5 old rows
    for (let i = 0; i < 5; i++) {
      insertRow(testDb, now() - days(1100 + i));
    }

    await pruneOldStats();

    // VACUUM should not have been called
    const vacuumCalls = vacuumSpy.mock.calls.filter(
      (call) =>
        typeof call[0] === "string" &&
        (call[0] as string).trim().toUpperCase() === "VACUUM",
    );
    expect(vacuumCalls).toHaveLength(0);
  });

  it("should run VACUUM when more than 10,000 rows are deleted", async () => {
    // Spy on the Drizzle db.run method (testDb.run) — see comment above.
    const vacuumSpy = vi.spyOn(testDb, "run");

    // Insert 10,001 old rows (one beyond the threshold)
    const insertStmt = sqliteDb.prepare(`
      INSERT INTO timeseries_stats
        (timestamp, resolution, acars_count, vdlm_count, hfdl_count,
         imsl_count, irdm_count, total_count, error_count, created_at)
      VALUES (?, '1min', 1, 0, 0, 0, 0, 1, 0, 0)
    `);

    const oldTimestamp = now() - days(1100);
    const insertMany = sqliteDb.transaction((count: number) => {
      for (let i = 0; i < count; i++) {
        insertStmt.run(oldTimestamp - i);
      }
    });
    insertMany(10_001);

    await pruneOldStats();

    const vacuumCalls = vacuumSpy.mock.calls.filter(
      (call) =>
        typeof call[0] === "string" &&
        (call[0] as string).trim().toUpperCase() === "VACUUM",
    );
    expect(vacuumCalls.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// pruneOldStats — error handling
// ---------------------------------------------------------------------------

describe("pruneOldStats — error handling", () => {
  it("should re-throw errors from the database", async () => {
    // Replace the mock with a database that throws on delete
    const brokenDb = {
      delete: () => {
        throw new Error("Database is locked");
      },
    } as unknown as ReturnType<typeof drizzle<typeof schema>>;

    vi.spyOn(clientModule, "getDatabase").mockReturnValue(brokenDb);

    await expect(pruneOldStats()).rejects.toThrow("Database is locked");
  });
});
