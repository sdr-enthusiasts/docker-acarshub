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
 * Dedicated test suite for migration 17 (messages_session_id_index).
 *
 * Follows the same pattern as migration16.test.ts: runMigrations() is run
 * once against a temp *file* database (not `:memory:` — runMigrations()
 * opens its own connection by path, and a `:memory:` database is
 * per-connection, so a separate inspection connection would never see the
 * migrated schema). Each test opens its own connection wrapped in a
 * transaction that afterEach rolls back, keeping the suite order-independent
 * despite sharing one underlying file.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "../migrate.js";
import { migration17_messagesSessionIdIndex } from "../migrations/migration17.js";

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let tmpDir: string;
let dbPath: string;

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "acarshub-migration17-"));
  dbPath = join(tmpDir, "test.db");
  runMigrations(dbPath);
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

let db: Database.Database | undefined;

afterEach(() => {
  if (db) {
    if (db.inTransaction) db.exec("ROLLBACK");
    db.close();
    db = undefined;
  }
});

function openConnection(): Database.Database {
  db = new Database(dbPath);
  db.exec("BEGIN");
  return db;
}

// ---------------------------------------------------------------------------
// Index shape
// ---------------------------------------------------------------------------

describe("migration 17: index shape", () => {
  it("creates ix_messages_session_id on messages(session_id)", () => {
    const conn = openConnection();
    const indexInfo = conn
      .prepare("PRAGMA index_info(ix_messages_session_id)")
      .all() as Array<{ seqno: number; name: string }>;

    expect(indexInfo.map((c) => c.name)).toEqual(["session_id"]);
  });

  it("the index is on the messages table", () => {
    const conn = openConnection();
    const indexList = conn
      .prepare("PRAGMA index_list(messages)")
      .all() as Array<{ name: string; origin: string }>;

    const found = indexList.find((i) => i.name === "ix_messages_session_id");
    expect(found).toBeDefined();
    // 'c' = explicitly CREATE INDEX-created, as opposed to 'pk'/'u' (implicit
    // constraint-backed indexes).
    expect(found?.origin).toBe("c");
  });
});

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

describe("migration 17: idempotency", () => {
  it("applying migration 17 a second time is a no-op rather than an error", () => {
    const localDir = mkdtempSync(join(tmpdir(), "acarshub-migration17-idem-"));
    const localDbPath = join(localDir, "test.db");
    try {
      runMigrations(localDbPath);

      const conn = new Database(localDbPath);
      try {
        expect(() => {
          migration17_messagesSessionIdIndex(conn);
        }).not.toThrow();

        const indexInfo = conn
          .prepare("PRAGMA index_info(ix_messages_session_id)")
          .all() as Array<{ name: string }>;
        expect(indexInfo.map((c) => c.name)).toEqual(["session_id"]);
      } finally {
        conn.close();
      }
    } finally {
      rmSync(localDir, { recursive: true, force: true });
    }
  });

  it("refuses to run against a database where ix_messages_session_id already points at a different definition", () => {
    // v4.3 migrations are editable until release, so a developer can hold a
    // database where an earlier draft (or a hand-created index of the same
    // name) shaped this index differently. CREATE INDEX IF NOT EXISTS would
    // silently accept the pre-existing, differently-shaped index; the
    // shape-drift guard in migration17.ts converts that into a loud,
    // actionable failure instead.
    const localDir = mkdtempSync(
      join(tmpdir(), "acarshub-migration17-drift-"),
    );
    const localDbPath = join(localDir, "test.db");
    try {
      // Run only through migration 16 so `messages` and `aircraft` exist but
      // migration 17 has not yet created the real index — then hand-create a
      // differently-shaped index under the same name to simulate drift.
      runMigrations(localDbPath);

      const conn = new Database(localDbPath);
      try {
        conn.exec("DROP INDEX ix_messages_session_id");
        conn.exec(
          "CREATE INDEX ix_messages_session_id ON messages(session_id, icao)",
        );

        expect(() => {
          migration17_messagesSessionIdIndex(conn);
        }).toThrow(/already exists with a definition this migration did not create/);
      } finally {
        conn.close();
      }
    } finally {
      rmSync(localDir, { recursive: true, force: true });
    }
  });

  it("does NOT treat a whitespace/case-only difference as drift", () => {
    const localDir = mkdtempSync(
      join(tmpdir(), "acarshub-migration17-whitespace-"),
    );
    const localDbPath = join(localDir, "test.db");
    try {
      // Migration 17 runs as part of runMigrations(), so start from a
      // pre-17 state by re-running only migration 16's effects via the full
      // chain, then drop and recreate the index with trivial formatting
      // differences (extra whitespace, different keyword case) that must
      // still be recognized as the same shape.
      runMigrations(localDbPath);

      const conn = new Database(localDbPath);
      try {
        conn.exec("DROP INDEX ix_messages_session_id");
        conn.exec(
          "create index  IX_MESSAGES_SESSION_ID on messages (  session_id  )",
        );

        expect(() => {
          migration17_messagesSessionIdIndex(conn);
        }).not.toThrow();
      } finally {
        conn.close();
      }
    } finally {
      rmSync(localDir, { recursive: true, force: true });
    }
  });
});
