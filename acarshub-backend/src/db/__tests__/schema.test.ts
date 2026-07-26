// Copyright (C) 2022-2026 Frederick Clausen II
// This file is part of acarshub <https://github.com/sdr-enthusiasts/docker-acarshub>.

// acarshub is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// acarshub is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with acarshub.  If not, see <http://www.gnu.org/licenses/>.

/**
 * db/schema.ts smoke test (TEST-GAP-BE).
 *
 * schema.ts is Drizzle's schema DSL, not the source of truth for the real
 * on-disk DDL — this project uses a hand-maintained custom migration runner
 * (db/migrations/*.ts, see GOD-02), not drizzle-kit generation from this
 * file. That means schema.ts and the migrations can silently drift apart:
 * a column renamed in a migration but not in schema.ts (or vice versa)
 * would only surface as a runtime "column does not exist" error the first
 * time a query touches the mismatched field — exactly the kind of gap the
 * original finding ("no smoke test that tables/indexes match expectations")
 * was pointing at.
 *
 * This test runs the REAL migration runner against a temp-file SQLite
 * database (not `:memory:` — runMigrations() opens its own connection by
 * path, and `:memory:` is per-connection, so a `:memory:` migration and a
 * separate `:memory:` inspection connection would never see the same
 * schema; same rationale as ingestion.integration.test.ts), then
 * introspects the resulting real tables via `PRAGMA table_info` and
 * `sqlite_master`, comparing them against every column and named index
 * schema.ts declares via Drizzle's own `getTableColumns`/`getTableName`
 * helpers (not hand-duplicated column lists, which would just be checking
 * schema.ts against itself).
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getTableColumns, getTableName, type Table } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDatabase, getSqliteConnection, initDatabase } from "../client.js";
import { runMigrations } from "../migrate.js";
import * as schema from "../schema.js";

// ---------------------------------------------------------------------------
// Every table schema.ts declares. Kept as an explicit list (rather than
// programmatically discovering schema.ts's exports) so that adding a new
// table without adding it here is a visible, deliberate omission rather
// than a silent one.
// ---------------------------------------------------------------------------

const ALL_TABLES: ReadonlyArray<Table> = [
  schema.messages,
  schema.alertMatches,
  schema.freqsAcars,
  schema.freqsVdlm2,
  schema.freqsHfdl,
  schema.freqsImsl,
  schema.freqsIrdm,
  schema.levelAcars,
  schema.levelVdlm2,
  schema.levelHfdl,
  schema.levelImsl,
  schema.levelIrdm,
  schema.messagesCount,
  schema.messagesCountDropped,
  schema.alertStats,
  schema.ignoreAlertTerms,
  schema.timeseriesStats,
  schema.rrdImportRegistry,
];

// Every explicitly-named index declared in schema.ts's `(table) => ({...})`
// index-builder blocks (messages, alert_matches, rrd_import_registry).
// Composite/covering indexes added purely by migrations for query
// optimisation but never named in schema.ts (there are none currently) are
// intentionally out of scope — this list only tracks indexes schema.ts
// itself claims exist.
//
// NOTE: this list previously also included ix_messages_depa, _dsta,
// _flight, _freq, _label, and _tail — schema.ts declared them, but
// migration 15 (drop_unnecessary_indexes2) had already dropped all six in
// a real, already-shipped migration. This very test caught that drift on
// first run; both schema.ts and this list were corrected to match reality
// rather than the test being adjusted to tolerate the mismatch.
const EXPECTED_INDEXES: readonly string[] = [
  "ix_messages_icao",
  "ix_messages_msgno",
  "ix_messages_type_time",
  "ix_alert_matches_message_id",
  "ix_alert_matches_term_time",
  "ix_alert_matches_id_term",
  "idx_rrd_import_registry_hash",
];

// ---------------------------------------------------------------------------
// Introspection helpers
// ---------------------------------------------------------------------------

interface RealColumn {
  name: string;
  type: string;
  notnull: number;
  pk: number;
}

function getRealColumns(tableName: string): RealColumn[] {
  // PRAGMA statements don't support bound parameters in better-sqlite3;
  // tableName always comes from the fixed ALL_TABLES list above, never
  // from external input, so string interpolation here is safe.
  return getSqliteConnection()
    .prepare(`PRAGMA table_info(${tableName})`)
    .all() as RealColumn[];
}

function getRealIndexNames(): Set<string> {
  const rows = getSqliteConnection()
    .prepare("SELECT name FROM sqlite_master WHERE type = 'index'")
    .all() as { name: string }[];
  return new Set(rows.map((row) => row.name));
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

// A single migrated database, shared read-only across every test in this
// file via beforeAll/afterAll — none of these tests mutate the schema
// itself (the file_hash uniqueness test below inserts rows, but into a
// table no other test reads from). Re-running the full 15-migration chain
// per-test (the beforeEach/afterEach pattern used by
// ingestion.integration.test.ts, where each test DOES need row-level
// isolation) would be ~35x slower here for no isolation benefit.
let tmpDir: string;
let dbPath: string;

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "acarshub-schema-smoke-"));
  dbPath = join(tmpDir, "test.db");
  runMigrations(dbPath);
  initDatabase(dbPath);
});

afterAll(() => {
  closeDatabase();
  rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("db/schema.ts smoke test (TEST-GAP-BE)", () => {
  describe("every declared table exists in the migrated database", () => {
    it.each(ALL_TABLES.map((table) => [getTableName(table), table] as const))(
      "table '%s' exists with every schema.ts-declared column present",
      (tableName, table) => {
        const realColumns = getRealColumns(tableName);
        expect(
          realColumns.length,
          `table '${tableName}' must exist in the migrated database`,
        ).toBeGreaterThan(0);

        const realColumnNames = new Set(realColumns.map((c) => c.name));
        const declaredColumns = getTableColumns(table);

        for (const [fieldName, column] of Object.entries(declaredColumns)) {
          expect(
            realColumnNames.has(column.name),
            `schema.ts field '${fieldName}' declares column '${column.name}' ` +
              `on table '${tableName}', but the real migrated table has no ` +
              `such column (real columns: ${[...realColumnNames].join(", ")})`,
          ).toBe(true);
        }
      },
    );
  });

  describe("primary keys match between schema.ts and the migrated database", () => {
    it.each([
      ["messages", "id"],
      ["alert_matches", "id"],
      ["timeseries_stats", "timestamp"],
      ["rrd_import_registry", "id"],
    ] as const)(
      "table '%s' has '%s' as its primary key",
      (tableName, expectedPkColumn) => {
        const realColumns = getRealColumns(tableName);
        const pkColumns = realColumns.filter((c) => c.pk > 0);
        expect(pkColumns).toHaveLength(1);
        expect(pkColumns[0]?.name).toBe(expectedPkColumn);
      },
    );
  });

  describe("every schema.ts-declared named index exists", () => {
    it.each(EXPECTED_INDEXES)("index '%s' exists", (indexName) => {
      expect(getRealIndexNames().has(indexName)).toBe(true);
    });
  });

  describe("migration 15's index drops stay dropped", () => {
    // Locks in the drift this test caught on first run: schema.ts declared
    // these six single-column indexes, but migration15_dropUnnecessaryIndexes2
    // (commit c994e8e4, "for searches on these columns, the FTS search is
    // used thus a separate index for the column is not necessary") had
    // already removed them from every real migrated database. Pinning their
    // absence — not just omitting them from EXPECTED_INDEXES — makes the
    // intent explicit and catches an accidental re-add in either direction.
    it.each([
      "ix_messages_depa",
      "ix_messages_dsta",
      "ix_messages_flight",
      "ix_messages_freq",
      "ix_messages_label",
      "ix_messages_tail",
    ])("index '%s' does not exist", (indexName) => {
      expect(getRealIndexNames().has(indexName)).toBe(false);
    });
  });

  describe("rrd_import_registry.file_hash uniqueness is enforced", () => {
    it("rejects a second row with a duplicate file_hash", () => {
      const conn = getSqliteConnection();
      conn
        .prepare(
          `INSERT INTO rrd_import_registry (file_hash, rrd_path, imported_at, rows_imported)
           VALUES (?, ?, ?, ?)`,
        )
        .run("deadbeef", "/tmp/a.rrd", Date.now(), 10);

      expect(() => {
        conn
          .prepare(
            `INSERT INTO rrd_import_registry (file_hash, rrd_path, imported_at, rows_imported)
             VALUES (?, ?, ?, ?)`,
          )
          .run("deadbeef", "/tmp/b.rrd", Date.now(), 5);
      }).toThrow(/UNIQUE constraint failed/);
    });
  });
});
