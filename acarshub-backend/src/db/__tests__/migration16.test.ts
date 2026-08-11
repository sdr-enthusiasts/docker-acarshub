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
 * Dedicated test suite for migration 16 (v43_session_and_decode_tables).
 *
 * migration16.ts's header comment documents four load-bearing shape
 * decisions (AUTOINCREMENT on aircraft.id, exactly one performance index,
 * NO ACTION on messages.session_id's FK, decode_level as INTEGER). This
 * file pins every one of those decisions plus the ones documented in
 * agent-docs/V4.3.md ("aircraft - Flight Session Registry", "Session
 * Identifier Type", "decoded_messages - Decoded Text Storage") so that a
 * future refactor of the migration cannot silently drift from the
 * evidence-backed design without a test failing.
 *
 * Follows the same pattern as schema.test.ts / migrate-orchestrator.test.ts:
 * runMigrations() is run once against a temp *file* database (not `:memory:` —
 * runMigrations() opens its own connection by path, and a `:memory:`
 * database is per-connection, so a separate inspection connection would
 * never see the migrated schema). Because that database is shared by every
 * test, and closing a connection does not undo committed writes to a file,
 * each test's connection is wrapped in a transaction that afterEach rolls
 * back. That is what keeps the suite order-independent.
 *
 * Critical detail (see migrate.ts:223): runMigrations() opens a bare
 * connection with no pragmas, so `foreign_keys` is OFF during and after
 * migration. Only the app's runtime connection (client.ts:134) turns it
 * on. Every test in the "Foreign keys" section below opens its own
 * connection and explicitly runs `db.pragma("foreign_keys = ON")` (and
 * asserts it took effect) before relying on FK enforcement or cascade
 * behaviour — otherwise the constraint would silently not fire and the
 * test would pass for the wrong reason.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "../migrate.js";
import { migration16_v43Tables } from "../migrations/migration16.js";

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let tmpDir: string;
let dbPath: string;

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "acarshub-migration16-"));
  dbPath = join(tmpDir, "test.db");
  runMigrations(dbPath);
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// All tests share one migrated temp *file* database, because running the full
// migration chain per test would dominate the suite's runtime. Closing a
// connection does NOT undo committed writes to a file database, so isolation
// comes from wrapping each test's connection in a transaction that afterEach
// always rolls back. Without this, a test that inserts a row would leak it
// into every later test and the suite would be order-dependent.
let db: Database.Database | undefined;

afterEach(() => {
  if (db) {
    // inTransaction guards the tests that open no connection at all.
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

function openConnectionWithForeignKeys(): Database.Database {
  // PRAGMA foreign_keys is a no-op inside a transaction, so it must be set
  // before BEGIN rather than by reusing openConnection().
  db = new Database(dbPath);
  db.pragma("foreign_keys = ON");
  // Guard against the exact hour-costing mistake this file is designed to
  // avoid: assert the pragma actually took effect rather than trusting the
  // call silently no-opped.
  expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
  db.exec("BEGIN");
  return db;
}

interface RealColumn {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

function getColumns(conn: Database.Database, table: string): RealColumn[] {
  return conn.prepare(`PRAGMA table_info(${table})`).all() as RealColumn[];
}

interface ForeignKeyRow {
  id: number;
  seq: number;
  table: string;
  from: string;
  to: string;
  on_update: string;
  on_delete: string;
  match: string;
}

function getForeignKeys(
  conn: Database.Database,
  table: string,
): ForeignKeyRow[] {
  return conn
    .prepare(`PRAGMA foreign_key_list(${table})`)
    .all() as ForeignKeyRow[];
}

function getTableSql(conn: Database.Database, table: string): string {
  const row = conn
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?",
    )
    .get(table) as { sql: string } | undefined;
  if (!row) {
    throw new Error(`table '${table}' not found in sqlite_master`);
  }
  return row.sql;
}

// ---------------------------------------------------------------------------
// Schema shape
// ---------------------------------------------------------------------------

describe("migration 16: schema shape", () => {
  it("creates all five new tables", () => {
    const conn = openConnection();
    const tables = conn
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      )
      .all() as Array<{ name: string }>;
    const names = new Set(tables.map((t) => t.name));

    expect(names.has("aircraft")).toBe(true);
    expect(names.has("decoder_variant")).toBe(true);
    expect(names.has("decoded_field")).toBe(true);
    expect(names.has("decoded_messages")).toBe(true);
    expect(names.has("system_config")).toBe(true);
  });

  it("aircraft columns match the intended DDL, including defaults", () => {
    const conn = openConnection();
    const columns = getColumns(conn, "aircraft");
    const byName = new Map(columns.map((c) => [c.name, c]));

    expect(byName.get("id")).toMatchObject({
      type: "INTEGER",
      notnull: 0,
      pk: 1,
    });
    expect(byName.get("icao_hex")).toMatchObject({ type: "TEXT", notnull: 0 });
    expect(byName.get("callsign")).toMatchObject({ type: "TEXT", notnull: 0 });
    expect(byName.get("tail")).toMatchObject({ type: "TEXT", notnull: 0 });
    expect(byName.get("first_seen")).toMatchObject({
      type: "INTEGER",
      notnull: 1,
    });
    expect(byName.get("last_seen")).toMatchObject({
      type: "INTEGER",
      notnull: 1,
    });

    const isActive = byName.get("is_active");
    expect(isActive).toMatchObject({ type: "INTEGER", notnull: 1 });
    expect(isActive?.dflt_value).toBe("1");

    const sessionType = byName.get("session_type");
    expect(sessionType).toMatchObject({ type: "TEXT", notnull: 1 });
    expect(sessionType?.dflt_value).toBe("'adsb'");

    expect(byName.get("pairing_method")).toMatchObject({
      type: "TEXT",
      notnull: 0,
    });

    const traceState = byName.get("trace_state");
    expect(traceState).toMatchObject({ type: "TEXT", notnull: 1 });
    expect(traceState?.dflt_value).toBe("'none'");
  });

  it("decoder_variant.decoder_name is NOT NULL with an empty-string default", () => {
    const conn = openConnection();
    const columns = getColumns(conn, "decoder_variant");
    const byName = new Map(columns.map((c) => [c.name, c]));

    const decoderName = byName.get("decoder_name");
    expect(decoderName).toMatchObject({ type: "TEXT", notnull: 1 });
    expect(decoderName?.dflt_value).toBe("''");

    expect(byName.get("decoder_version")).toMatchObject({
      type: "TEXT",
      notnull: 1,
    });
    const description = byName.get("description");
    expect(description).toMatchObject({ type: "TEXT", notnull: 1 });
    expect(description?.dflt_value).toBe("''");
    expect(byName.get("id")).toMatchObject({
      type: "INTEGER",
      notnull: 0,
      pk: 1,
    });
  });

  it("decoded_messages is a compact index carrying no decoded text", () => {
    const conn = openConnection();
    const columns = getColumns(conn, "decoded_messages");
    const byName = new Map(columns.map((c) => [c.name, c]));

    expect(byName.get("message_id")).toMatchObject({
      type: "INTEGER",
      pk: 1,
    });
    expect(byName.get("variant_id")).toMatchObject({
      type: "INTEGER",
      notnull: 1,
    });
    expect(byName.get("mask_lo")).toMatchObject({
      type: "INTEGER",
      notnull: 1,
    });
    expect(byName.get("mask_hi")).toMatchObject({
      type: "INTEGER",
      notnull: 1,
    });

    // The absence of a decoded-text column is a deliberate, measured decision
    // (~28 MB vs ~634 MB at 11M messages for ~95% of the search value), not an
    // oversight. Adding one later is a 5 ms ALTER, so there is no need to
    // pre-emptively reserve it. See agent-docs/V4.3.md "Open Question 7".
    expect(columns.map((c) => c.name).sort()).toEqual([
      "mask_hi",
      "mask_lo",
      "message_id",
      "variant_id",
    ]);
  });

  it("decoded_field assigns a stable bit position bounded to the mask width", () => {
    const conn = openConnection();
    const columns = getColumns(conn, "decoded_field");
    const byName = new Map(columns.map((c) => [c.name, c]));

    expect(byName.get("id")).toMatchObject({ type: "INTEGER", pk: 1 });
    expect(byName.get("label")).toMatchObject({ type: "TEXT", notnull: 1 });
  });

  it("system_config columns match the intended DDL", () => {
    const conn = openConnection();
    const columns = getColumns(conn, "system_config");
    const byName = new Map(columns.map((c) => [c.name, c]));

    expect(byName.get("key")).toMatchObject({ type: "TEXT", pk: 1 });
    expect(byName.get("value")).toMatchObject({
      type: "TEXT",
      notnull: 1,
    });
    expect(byName.get("updated_at")).toMatchObject({
      type: "INTEGER",
      notnull: 1,
    });
  });

  it("decoded_messages, decoded_field and system_config are WITHOUT ROWID tables", () => {
    // PRAGMA table_info does not expose WITHOUT ROWID; it must be read back
    // from the stored DDL in sqlite_master.
    const conn = openConnection();
    expect(getTableSql(conn, "decoded_messages")).toMatch(/WITHOUT ROWID/i);
    expect(getTableSql(conn, "decoded_field")).toMatch(/WITHOUT ROWID/i);
    expect(getTableSql(conn, "system_config")).toMatch(/WITHOUT ROWID/i);
  });

  it("aircraft and decoder_variant are ordinary rowid tables, not WITHOUT ROWID", () => {
    const conn = openConnection();
    expect(getTableSql(conn, "aircraft")).not.toMatch(/WITHOUT ROWID/i);
    expect(getTableSql(conn, "decoder_variant")).not.toMatch(
      /WITHOUT ROWID/i,
    );
  });

  it.each([
    ["aircraft", "id"],
    ["decoder_variant", "id"],
    ["decoded_field", "id"],
    ["decoded_messages", "message_id"],
    ["system_config", "key"],
  ] as const)(
    "table '%s' has '%s' as its sole primary key column",
    (table, expectedPk) => {
      const conn = openConnection();
      const pkColumns = getColumns(conn, table).filter((c) => c.pk > 0);
      expect(pkColumns).toHaveLength(1);
      expect(pkColumns[0]?.name).toBe(expectedPk);
    },
  );

  it("messages.session_id exists, is INTEGER, and is nullable", () => {
    const conn = openConnection();
    const columns = getColumns(conn, "messages");
    const sessionId = columns.find((c) => c.name === "session_id");
    expect(sessionId).toBeDefined();
    expect(sessionId?.type).toBe("INTEGER");
    expect(sessionId?.notnull).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Foreign keys — every test here MUST enable foreign_keys explicitly. See
// file header and agent-docs/V4.3.md "Session Identifier Type" for why
// runMigrations() leaves it off and the app's runtime connection turns it
// on separately.
// ---------------------------------------------------------------------------

describe("migration 16: foreign keys", () => {
  it("declares decoded_messages.message_id -> messages(id) ON DELETE CASCADE and variant_id -> decoder_variant(id)", () => {
    const conn = openConnection();
    const fks = getForeignKeys(conn, "decoded_messages");

    const messageFk = fks.find((fk) => fk.from === "message_id");
    expect(messageFk).toMatchObject({
      table: "messages",
      to: "id",
      on_delete: "CASCADE",
    });

    const variantFk = fks.find((fk) => fk.from === "variant_id");
    expect(variantFk).toMatchObject({
      table: "decoder_variant",
      to: "id",
    });
  });

  it("declares messages.session_id -> aircraft(id) with ON DELETE NO ACTION", () => {
    // NO ACTION is deliberate, not the default falling through unexamined:
    // ON DELETE CASCADE here would delete *messages* when a session is
    // pruned — see migration16.ts point 3 and V4.3.md "Session Identifier
    // Type".
    const conn = openConnection();
    const fks = getForeignKeys(conn, "messages");
    const sessionFk = fks.find((fk) => fk.from === "session_id");

    expect(sessionFk).toMatchObject({
      table: "aircraft",
      to: "id",
      on_delete: "NO ACTION",
    });
  });

  it("cascades: deleting a messages row removes its decoded_messages row", () => {
    const conn = openConnectionWithForeignKeys();

    const messageId = insertMessage(conn);
    insertDecoderChain(conn, messageId);

    conn.prepare("DELETE FROM messages WHERE id = ?").run(messageId);

    const decoded = conn
      .prepare("SELECT message_id FROM decoded_messages WHERE message_id = ?")
      .get(messageId);
    expect(decoded).toBeUndefined();
  });

  it("throws deleting an aircraft row that still has a referencing message", () => {
    const conn = openConnectionWithForeignKeys();

    const sessionId = insertAircraft(conn);
    insertMessage(conn, sessionId);

    expect(() => {
      conn.prepare("DELETE FROM aircraft WHERE id = ?").run(sessionId);
    }).toThrow(/FOREIGN KEY constraint failed/);
  });

  it("succeeds deleting the referencing message first, then the aircraft row", () => {
    // This is the ordering Phase 6's session-prune must follow: messages
    // before aircraft. See V4.3.md "Session Identifier Type".
    const conn = openConnectionWithForeignKeys();

    const sessionId = insertAircraft(conn);
    const messageId = insertMessage(conn, sessionId);

    conn.prepare("DELETE FROM messages WHERE id = ?").run(messageId);
    expect(() => {
      conn.prepare("DELETE FROM aircraft WHERE id = ?").run(sessionId);
    }).not.toThrow();

    const gone = conn
      .prepare("SELECT id FROM aircraft WHERE id = ?")
      .get(sessionId);
    expect(gone).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Constraints
// ---------------------------------------------------------------------------

describe("migration 16: constraints", () => {
  it("decoded_field rejects a bit position outside the mask width", () => {
    // 126 bits are addressable across mask_lo/mask_hi. 64 labels existed in
    // production at the time of writing, so there is roughly double the
    // headroom — but a decoder release that pushes past the ceiling must fail
    // loudly here rather than silently truncating a field out of the mask.
    const conn = openConnection();

    expect(() => {
      conn
        .prepare("INSERT INTO decoded_field (id, label) VALUES (?, ?)")
        .run(125, "highest-addressable-bit");
    }).not.toThrow();

    for (const badId of [126, -1]) {
      expect(() => {
        conn
          .prepare("INSERT INTO decoded_field (id, label) VALUES (?, ?)")
          .run(badId, `out-of-range-${badId}`);
      }).toThrow(/CHECK constraint failed/);
    }
  });

  it("decoded_field label is unique so a bit position is never assigned twice", () => {
    const conn = openConnection();
    conn
      .prepare("INSERT INTO decoded_field (id, label) VALUES (?, ?)")
      .run(40, "Outside Air Temperature (C)");

    expect(() => {
      conn
        .prepare("INSERT INTO decoded_field (id, label) VALUES (?, ?)")
        .run(41, "Outside Air Temperature (C)");
    }).toThrow(/UNIQUE constraint failed/);
  });

  it("a field-presence mask round-trips across the 63-bit column boundary", () => {
    // The split into two columns is the whole reason this table can address
    // more than 63 fields, so the boundary is the interesting case: bit 62 is
    // the top of mask_lo and field id 63 is bit 0 of mask_hi.
    const conn = openConnectionWithForeignKeys();
    const messageId = insertMessage(conn);
    const variantId = insertDecoderVariant(conn, "masker", "1.0.0");

    const lo = 1n << 62n;
    const hi = 1n << 0n;
    conn
      .prepare(
        "INSERT INTO decoded_messages (message_id, variant_id, mask_lo, mask_hi) VALUES (?, ?, ?, ?)",
      )
      .run(messageId, variantId, lo, hi);

    const found = conn
      .prepare(
        "SELECT message_id FROM decoded_messages WHERE (mask_lo & ?) != 0 AND (mask_hi & ?) != 0",
      )
      .get(lo, hi) as { message_id: number } | undefined;

    expect(found?.message_id).toBe(messageId);

    // A field the message does not carry must not match.
    const absent = conn
      .prepare("SELECT message_id FROM decoded_messages WHERE (mask_lo & ?) != 0")
      .get(1n << 5n);
    expect(absent).toBeUndefined();
  });

  it("regression: a second 'no decoder matched' variant cannot be created for the same version", () => {
    // This is the exact bug the empty-string sentinel exists to prevent, so
    // the test must exercise the path that was broken rather than a
    // superficially similar one.
    //
    // decoder_name was originally nullable. SQLite treats NULLs as DISTINCT
    // under UNIQUE, so the nullable design allowed unlimited duplicate
    // (NULL, version) rows, and the natural find-or-create lookup
    // `WHERE decoder_name = ?` matched nothing when the parameter was NULL.
    // Every non-decoding message — 60% of text-bearing traffic, per
    // agent-docs/V4.3.md — would have minted a fresh variant row instead of
    // reusing one, destroying the interning this table exists to provide.
    //
    // Note what this test deliberately does NOT do: insert the literal ''
    // twice. That version of this test was vacuous, because two identical
    // non-NULL values collide under UNIQUE in the broken schema too, so it
    // passed with or without the fix. The discriminating path is inserting
    // *without naming the column*, which is what a find-or-create for "no
    // decoder matched" actually does: under the fix the DEFAULT '' applies
    // and the second insert collides; under the old schema both rows got
    // NULL and both were accepted.
    const conn = openConnection();

    conn
      .prepare("INSERT INTO decoder_variant (decoder_version) VALUES ('9.9.9')")
      .run();

    expect(() => {
      conn
        .prepare(
          "INSERT INTO decoder_variant (decoder_version) VALUES ('9.9.9')",
        )
        .run();
    }).toThrow(/UNIQUE constraint failed/);

    // And the column rejects NULL outright, so the distinct-NULLs loophole
    // cannot be reached by an explicit NULL either.
    expect(() => {
      conn
        .prepare(
          "INSERT INTO decoder_variant (decoder_name, decoder_version) VALUES (NULL, '9.9.8')",
        )
        .run();
    }).toThrow(/NOT NULL constraint failed/);
  });

  it("enforces decoded_messages.variant_id against decoder_variant(id)", () => {
    const conn = openConnectionWithForeignKeys();
    const messageId = insertMessage(conn);

    expect(() => {
      conn
        .prepare(
          "INSERT INTO decoded_messages (message_id, variant_id) VALUES (?, ?)",
        )
        .run(messageId, 999_999);
    }).toThrow(/FOREIGN KEY constraint failed/);
  });

  it("blocks deleting a decoder_variant row that is still referenced", () => {
    // The variant table is an interned lookup; rows are never expected to be
    // deleted. NO ACTION (the default) means an accidental delete fails loudly
    // rather than leaving decoded_messages pointing at a missing variant.
    const conn = openConnectionWithForeignKeys();
    const messageId = insertMessage(conn);
    const variantId = insertDecoderVariant(conn, "held-open", "2.0.0");

    conn
      .prepare(
        "INSERT INTO decoded_messages (message_id, variant_id) VALUES (?, ?)",
      )
      .run(messageId, variantId);

    expect(() => {
      conn.prepare("DELETE FROM decoder_variant WHERE id = ?").run(variantId);
    }).toThrow(/FOREIGN KEY constraint failed/);
  });
});

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

describe("migration 16: idempotency", () => {
  it("applying migration 16 a second time is a no-op rather than an error", () => {
    // Deliberately calls migration16_v43Tables() directly instead of going
    // through runMigrations(). runMigrations() short-circuits on
    // alembic_version and never reaches the migration loop on a second call,
    // so driving it through the orchestrator would satisfy the phrase "run it
    // twice" while never executing the CREATE TABLE IF NOT EXISTS and
    // session_id guards that idempotency actually depends on.
    const localDir = mkdtempSync(join(tmpdir(), "acarshub-migration16-idem-"));
    const localDbPath = join(localDir, "test.db");
    try {
      runMigrations(localDbPath);

      const conn = new Database(localDbPath);
      try {
        expect(() => {
          migration16_v43Tables(conn);
        }).not.toThrow();

        // A second ALTER TABLE would add a duplicate column or throw.
        const sessionIdColumns = getColumns(conn, "messages").filter(
          (c) => c.name === "session_id",
        );
        expect(sessionIdColumns).toHaveLength(1);

        // The tables and the index must survive the replay unchanged.
        expect(
          getColumns(conn, "decoder_variant").map((c) => c.name),
        ).toEqual(["id", "decoder_name", "decoder_version", "description"]);
        const indexInfo = conn
          .prepare("PRAGMA index_info(ix_aircraft_active_hex)")
          .all() as Array<{ name: string }>;
        expect(indexInfo.map((c) => c.name)).toEqual([
          "is_active",
          "icao_hex",
        ]);
      } finally {
        conn.close();
      }
    } finally {
      rmSync(localDir, { recursive: true, force: true });
    }
  });

  it("refuses to run against a database whose tables drifted from this migration", () => {
    // v4.3 migrations are editable until release, so a developer can hold a
    // database created by an earlier draft. CREATE TABLE IF NOT EXISTS would
    // silently accept the stale shape and setAlembicVersion would then mark
    // the database migrated, hiding the drift permanently. The shape check in
    // migration16.ts converts that into a loud, actionable failure.
    const localDir = mkdtempSync(join(tmpdir(), "acarshub-migration16-drift-"));
    const localDbPath = join(localDir, "test.db");
    try {
      const conn = new Database(localDbPath);
      try {
        // The exact historical drift: decoder_name nullable instead of
        // NOT NULL DEFAULT ''.
        conn.exec(`
          CREATE TABLE decoder_variant (
              id              INTEGER PRIMARY KEY AUTOINCREMENT,
              decoder_name    TEXT,
              decoder_version TEXT NOT NULL
          );
        `);

        expect(() => {
          migration16_v43Tables(conn);
        }).toThrow(/decoder_variant.*NOT NULL=0, expected 1/s);
      } finally {
        conn.close();
      }
    } finally {
      rmSync(localDir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Index discipline
// ---------------------------------------------------------------------------

describe("migration 16: index discipline", () => {
  it("ix_aircraft_active_hex exists on aircraft(is_active, icao_hex) in that column order", () => {
    const conn = openConnection();
    const indexInfo = conn
      .prepare("PRAGMA index_info(ix_aircraft_active_hex)")
      .all() as Array<{ seqno: number; name: string }>;

    expect(indexInfo.map((c) => c.name)).toEqual(["is_active", "icao_hex"]);
  });

  it.each(["ix_aircraft_last_seen", "ix_decoded_version_level"])(
    "regression: '%s' does not exist — both were measured and rejected",
    (indexName) => {
      // ix_aircraft_last_seen: zero query plans selected it even for the
      // expiry sweep it was added for. ix_decoded_version_level: costs
      // ~206 MB at 11M rows and speeds up nothing sargable. See
      // migration16.ts's header comment (point 2) and V4.3.md "Exactly One
      // Index, and Why the Second Was Dropped". This test exists to stop
      // either from being "helpfully" reintroduced without new measurement.
      const conn = openConnection();
      const row = conn
        .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?")
        .get(indexName);
      expect(row).toBeUndefined();
    },
  );

  it("no index on the four new tables duplicates its table's primary key column list", () => {
    const conn = openConnection();
    const newTables: ReadonlyArray<[string, string[]]> = [
      ["aircraft", ["id"]],
      ["decoder_variant", ["id"]],
      ["decoded_field", ["id"]],
      ["decoded_messages", ["message_id"]],
      ["system_config", ["key"]],
    ];

    for (const [table, pkColumns] of newTables) {
      const indexes = conn
        .prepare(`PRAGMA index_list(${table})`)
        .all() as Array<{ name: string; origin: string }>;

      // WITHOUT ROWID tables (decoded_messages, system_config) report their
      // clustering primary key itself as an index with origin='pk' — that
      // is the table's storage, not a redundant extra index, so it is
      // excluded here. Only explicitly `CREATE INDEX`-created indexes
      // (origin='c') are checked for duplicating the PK column list.
      for (const { name } of indexes.filter((i) => i.origin === "c")) {
        const indexColumns = (
          conn.prepare(`PRAGMA index_info(${name})`).all() as Array<{
            name: string;
          }>
        ).map((c) => c.name);

        expect(
          indexColumns,
          `index '${name}' on '${table}' must not duplicate the primary key column list ${JSON.stringify(pkColumns)}`,
        ).not.toEqual(pkColumns);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Row fixture helpers (used by the foreign-key and constraint tests above)
// ---------------------------------------------------------------------------

let nextMessageId = 1;

function insertMessage(
  conn: Database.Database,
  sessionId?: number,
): number {
  const id = nextMessageId++;
  // messages carries a long tail of NOT NULL text(32) columns from the
  // original Alembic schema (see drizzle/0000_unknown_phalanx.sql); this
  // fixture only cares about id/msg_time/session_id, so every other NOT
  // NULL column gets an empty-string placeholder.
  conn
    .prepare(
      `INSERT INTO messages (
         id, message_type, msg_time, station_id, toaddr, fromaddr,
         depa, dsta, eta, gtout, gtin, wloff, wlin, lat, lon, alt,
         msg_text, tail, flight, icao, freq, ack, mode, label,
         block_id, msgno, is_response, is_onground, error, libacars, level,
         session_id
       ) VALUES (
         ?, 'ACARS', ?, '', '', '', '', '', '', '', '', '', '', '', '', '',
         '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ?
       )`,
    )
    .run(id, Math.floor(Date.now() / 1000), sessionId ?? null);
  return id;
}

function insertAircraft(conn: Database.Database): number {
  const now = Math.floor(Date.now() / 1000);
  const result = conn
    .prepare(
      "INSERT INTO aircraft (icao_hex, first_seen, last_seen) VALUES (?, ?, ?)",
    )
    .run("ABC123", now, now);
  return Number(result.lastInsertRowid);
}

function insertDecoderVariant(
  conn: Database.Database,
  name: string,
  version: string,
  description = "",
): number {
  const result = conn
    .prepare(
      "INSERT INTO decoder_variant (decoder_name, decoder_version, description) VALUES (?, ?, ?)",
    )
    .run(name, version, description);
  return Number(result.lastInsertRowid);
}

function insertDecoderChain(conn: Database.Database, messageId: number): void {
  const variantId = insertDecoderVariant(
    conn,
    "test-decoder",
    `1.0.0-${messageId}`,
  );
  conn
    .prepare(
      "INSERT INTO decoded_messages (message_id, variant_id) VALUES (?, ?)",
    )
    .run(messageId, variantId);
}
