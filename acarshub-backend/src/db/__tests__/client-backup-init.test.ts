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
 * Regression test for LEAK-04: backup-database partial-init state.
 *
 * client.ts's initDatabase() only attempts backup-DB setup when called with
 * no dbPath argument (so it must be tested via the ACARSHUB_DB /
 * DB_BACKUP env vars + a fresh module import per test, mirroring the
 * dynamic-import pattern used by config.test.ts — client.ts reads both env
 * vars once at module-load time).
 *
 * The scenario under test: `new Database(DB_BACKUP_PATH)` succeeds, but a
 * subsequent `.pragma(...)` call on that connection throws. Before the fix,
 * the module-level `sqliteBackupConnection` reference was left set to that
 * partially-configured connection while `drizzleBackupClient` stayed null —
 * an inconsistent state where `hasBackupDatabase()` correctly reports
 * "disabled" but `checkpointBackup()` (which checks `sqliteBackupConnection`
 * directly, not `drizzleBackupClient`) would still try to use the stale
 * connection.
 */

import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let tmpDir: string;
let backupPath: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "acarshub-leak04-"));
  backupPath = join(tmpDir, "backup.db");
  vi.resetModules();
  process.env.ACARSHUB_DB = ":memory:";
  process.env.DB_BACKUP = backupPath;
});

afterEach(() => {
  vi.doUnmock("better-sqlite3");
  delete process.env.ACARSHUB_DB;
  delete process.env.DB_BACKUP;
  if (existsSync(tmpDir)) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

describe("initDatabase() backup-DB partial-init (LEAK-04)", () => {
  it("regression: nulls both backup refs (not just drizzleBackupClient) when a pragma throws after the connection opens", async () => {
    vi.doMock("better-sqlite3", async (importOriginal) => {
      const actual =
        await importOriginal<typeof import("better-sqlite3")>();
      const RealDatabase = actual.default;

      class FaultyDatabase extends RealDatabase {
        pragma(source: string, options?: Database.PragmaOptions): unknown {
          // Only sabotage the backup connection (identified by its file
          // path), and only on a pragma issued after journal_mode — so the
          // connection genuinely opens successfully first, matching the
          // "new Database() succeeded, a later pragma call threw" scenario.
          if (
            this.name === backupPath &&
            source.startsWith("synchronous")
          ) {
            throw new Error("simulated backup pragma failure");
          }
          return super.pragma(source, options);
        }
      }

      return { default: FaultyDatabase };
    });

    const { initDatabase, hasBackupDatabase, checkpointBackup, closeDatabase } =
      await import("../client.js");

    try {
      // initDatabase() with NO argument — the guard `DB_BACKUP_PATH &&
      // !dbPath` only attempts backup init on this call shape.
      initDatabase();

      expect(hasBackupDatabase()).toBe(false);

      // Before the fix, sqliteBackupConnection was left non-null here, so
      // checkpointBackup() would try to run wal_checkpoint(...) on the
      // partially-configured connection instead of returning null.
      expect(checkpointBackup()).toBeNull();
    } finally {
      closeDatabase();
    }
  });
});
