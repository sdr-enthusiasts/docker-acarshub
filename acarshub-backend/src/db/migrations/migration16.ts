// ----------------------------------------------------------------------------
// Migration 16: v43_session_and_decode_tables (4d2a7c918f3b)
//
// Adds the storage v4.3 Phase 1 needs: the `aircraft` session registry, the
// `decoder_variant` / `decoded_field` / `decoded_messages` decoder search
// index, the `system_config` key-value store, and `messages.session_id`. Does
// NOT add `aircraft_positions` — that table is deferred to migration 17
// (Phase 8), see agent-docs/V4.3.md "Why the Split".
//
// Every shape below is settled by measurement against a production database,
// not assumption — see agent-docs/V4.3.md for the full evidence. The four
// points that matter most for a future reader of this file:
//
// 1. `aircraft.id` is AUTOINCREMENT, deliberately. A plain INTEGER PRIMARY
//    KEY reuses the rowids of deleted rows, so once session pruning lands a
//    stale `messages.session_id` could silently re-point at a *different*,
//    newer session. AUTOINCREMENT makes a dangling reference stay dangling
//    instead of becoming a wrong one.
//
// 2. Exactly ONE performance index is created here: `ix_aircraft_active_hex`.
//    `ix_aircraft_last_seen` and `ix_decoded_version_level` were both
//    measured and explicitly rejected (zero query plans selected the
//    former even for the expiry sweep it was added for; the latter costs
//    ~206 MB at 11M rows and speeds up nothing sargable). Do not
//    "helpfully" add either back without new measurement.
//    `ix_decoder_variant_name_version` is also created, but it enforces a
//    uniqueness constraint on a 42-row lookup table — it is correctness,
//    not a performance index, and is not subject to the same test.
//
// 3. `messages.session_id` carries a FK to `aircraft(id)` with the default
//    `NO ACTION` — this is deliberate. `ON DELETE CASCADE` must NEVER be
//    used on this column: it would delete *messages* when a session is
//    pruned, which is the exact failure mode this schema exists to avoid.
//
// 4. `decoded_messages` stores NO decoded text. It is a compact search
//    index — message-type classification plus a field-presence bitmask —
//    measured at ~28 MB per 11M messages against ~634 MB for storing
//    decoded text with an FTS index over it, for ~95% of the search value.
//    Decoded text for display is produced on read (0.008 ms/decode), which
//    also means a displayed decode can never be stale. Expanding to
//    free-text search later is additive and cheap: ADD COLUMN is 5 ms and
//    CREATE VIRTUAL TABLE ... USING fts5 touches nothing, both verified at
//    4.2M rows. See agent-docs/V4.3.md "Open Question 7".
// ----------------------------------------------------------------------------

import type Database from "better-sqlite3";
import { createLogger } from "../../utils/logger.js";

const logger = createLogger("db:migrate-16");

interface ExpectedColumn {
  name: string;
  type: "INTEGER" | "TEXT";
  notnull: 0 | 1;
}

/**
 * `CREATE TABLE IF NOT EXISTS` silently accepts a table that already exists
 * with a *different* shape, which matters more than usual here: v4.3's
 * migrations are editable until the release ships (see agent-docs/V4.3.md
 * "Migrations Under This Plan Are Mutable Until v4.3 Ships"), so a developer
 * who applied an earlier draft of this migration and then pulls a corrected
 * one has a database whose tables do not match this file. Without this check
 * the migration would complete, `setAlembicVersion` would stamp the database
 * as migrated, and the drift would survive silently.
 *
 * Column name, declared type and NOT NULL are compared — nullability
 * specifically, because the one real drift this has already had to catch
 * (`decoder_name` nullable vs NOT NULL) leaves the column names identical.
 */
function assertTableShape(
  db: Database.Database,
  table: string,
  expected: readonly ExpectedColumn[],
): void {
  const actual = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
    name: string;
    type: string;
    notnull: number;
  }>;

  const actualByName = new Map(actual.map((c) => [c.name, c]));
  const drift: string[] = [];

  for (const column of expected) {
    const found = actualByName.get(column.name);
    if (!found) {
      drift.push(`missing column '${column.name}'`);
      continue;
    }
    if (found.type.toUpperCase() !== column.type) {
      drift.push(
        `column '${column.name}' is declared ${found.type || "(no type)"}, expected ${column.type}`,
      );
    }
    if (found.notnull !== column.notnull) {
      drift.push(
        `column '${column.name}' has NOT NULL=${found.notnull}, expected ${column.notnull}`,
      );
    }
  }

  const expectedNames = new Set(expected.map((c) => c.name));
  for (const column of actual) {
    if (!expectedNames.has(column.name)) {
      drift.push(`unexpected column '${column.name}'`);
    }
  }

  if (drift.length > 0) {
    throw new Error(
      `Table '${table}' already exists with a shape this migration did not create: ` +
        `${drift.join("; ")}. This normally means a pre-release draft of migration 16 ` +
        "was applied to this database. v4.3 migrations are editable until release, so " +
        "the fix is to discard this development database and re-migrate from scratch.",
    );
  }
}

export function migration16_v43Tables(db: Database.Database): void {
  logger.warn("Applying migration 16: v43_session_and_decode_tables");

  const migrate = db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS aircraft (
          id             INTEGER PRIMARY KEY AUTOINCREMENT,
          icao_hex       TEXT,
          callsign       TEXT,
          tail           TEXT,
          first_seen     INTEGER NOT NULL,
          last_seen      INTEGER NOT NULL,
          is_active      INTEGER NOT NULL DEFAULT 1,
          session_type   TEXT    NOT NULL DEFAULT 'adsb',
          pairing_method TEXT,
          trace_state    TEXT    NOT NULL DEFAULT 'none'
      )
    `);

    assertTableShape(db, "aircraft", [
      { name: "id", type: "INTEGER", notnull: 0 },
      { name: "icao_hex", type: "TEXT", notnull: 0 },
      { name: "callsign", type: "TEXT", notnull: 0 },
      { name: "tail", type: "TEXT", notnull: 0 },
      { name: "first_seen", type: "INTEGER", notnull: 1 },
      { name: "last_seen", type: "INTEGER", notnull: 1 },
      { name: "is_active", type: "INTEGER", notnull: 1 },
      { name: "session_type", type: "TEXT", notnull: 1 },
      { name: "pairing_method", type: "TEXT", notnull: 0 },
      { name: "trace_state", type: "TEXT", notnull: 1 },
    ]);

    db.exec(
      "CREATE INDEX IF NOT EXISTS ix_aircraft_active_hex ON aircraft(is_active, icao_hex)",
    );

    // `decoder_name` is NOT NULL with an empty-string sentinel for "no decoder
    // matched", rather than nullable. This is not a style choice. SQLite treats
    // NULLs as distinct in a UNIQUE constraint, so a nullable column would (a)
    // allow unlimited duplicate (NULL, version) rows and (b) make the natural
    // find-or-create lookup `WHERE decoder_name = ?` match nothing when the
    // parameter is NULL. The result would be one new variant row per
    // non-decoding message — 60% of text-bearing traffic — which destroys the
    // interning this table exists to provide.
    db.exec(`
      CREATE TABLE IF NOT EXISTS decoder_variant (
          id              INTEGER PRIMARY KEY AUTOINCREMENT,
          decoder_name    TEXT NOT NULL DEFAULT '',
          decoder_version TEXT NOT NULL,
          description     TEXT NOT NULL DEFAULT ''
      )
    `);

    assertTableShape(db, "decoder_variant", [
      { name: "id", type: "INTEGER", notnull: 0 },
      { name: "decoder_name", type: "TEXT", notnull: 1 },
      { name: "decoder_version", type: "TEXT", notnull: 1 },
      { name: "description", type: "TEXT", notnull: 1 },
    ]);

    // Declared as a named unique index rather than an inline UNIQUE table
    // constraint. Two reasons, and the second is the one that matters later:
    // it appears in sqlite_master under a predictable name so EXPECTED_INDEXES
    // in db/__tests__/schema.test.ts can pin it, and a named index can be
    // widened with DROP INDEX + CREATE UNIQUE INDEX, whereas SQLite cannot
    // alter an inline table constraint without rebuilding the whole table.
    // Do not "tidy" this back into an inline UNIQUE(...).
    //
    // `description` is part of the key because it is not quite a function of
    // the plugin: 39 of 41 observed plugins emit exactly one description, but
    // `arinc-702` emits 26 and `label-13-18-slash` emits 5. Keying on the
    // triple yields ~70 rows — still a single page.
    db.exec(
      `CREATE UNIQUE INDEX IF NOT EXISTS ix_decoder_variant_key
         ON decoder_variant(decoder_name, decoder_version, description)`,
    );

    // Stable label -> bit-position assignment for decoded_messages.mask_*.
    // This table is what makes the bitmask meaningful across restarts: if bit
    // positions were assigned in discovery order at runtime they would differ
    // between processes and every stored mask would decode to the wrong set of
    // fields. `id` IS the bit position, so rows are never renumbered or
    // deleted — a retired field simply leaves its bit permanently unused.
    //
    // The 0-125 bound is the capacity of the two 63-bit halves below. 64
    // distinct labels were observed in production, so there is headroom for
    // roughly double before this needs a third column; the CHECK makes hitting
    // that ceiling a loud failure rather than silent truncation.
    db.exec(`
      CREATE TABLE IF NOT EXISTS decoded_field (
          id    INTEGER PRIMARY KEY CHECK(id BETWEEN 0 AND 125),
          label TEXT NOT NULL
      ) WITHOUT ROWID
    `);

    assertTableShape(db, "decoded_field", [
      { name: "id", type: "INTEGER", notnull: 1 },
      { name: "label", type: "TEXT", notnull: 1 },
    ]);

    db.exec(
      `CREATE UNIQUE INDEX IF NOT EXISTS ix_decoded_field_label
         ON decoded_field(label)`,
    );

    // Compact search index over decoder output. Deliberately stores no decoded
    // text: measurement against a production corpus showed that ~95% of the
    // search value is message-type classification (`decoder_variant.description`,
    // e.g. "Ground Station Squitter" — 0 hits in raw text, 39,535 decoded) plus
    // which fields a message carries, and that storing decoded text plus an FTS
    // index to make it searchable costs ~9x more for the remaining ~5%. See
    // agent-docs/V4.3.md "Open Question 7". Decoded text for *display* is
    // produced on read, which also means it can never be stale.
    //
    // A row exists only for messages that actually decoded, so absence means
    // "no decoder output", not "not yet processed".
    //
    // mask_lo/mask_hi are a 126-bit field-presence set split across two
    // integers because SQLite's INTEGER is signed 64-bit and there were already
    // 64 distinct labels in production — one column would have been at capacity
    // on day one. Bit n of mask_lo is decoded_field id n; bit n of mask_hi is
    // decoded_field id n + 63.
    db.exec(`
      CREATE TABLE IF NOT EXISTS decoded_messages (
          message_id INTEGER PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
          variant_id INTEGER NOT NULL REFERENCES decoder_variant(id),
          mask_lo    INTEGER NOT NULL DEFAULT 0,
          mask_hi    INTEGER NOT NULL DEFAULT 0
      ) WITHOUT ROWID
    `);

    // Note `message_id` is notnull=1: in a WITHOUT ROWID table the primary key
    // is implicitly NOT NULL, unlike a rowid-alias INTEGER PRIMARY KEY (which
    // reports notnull=0, as `aircraft.id` and `decoder_variant.id` do above).
    assertTableShape(db, "decoded_messages", [
      { name: "message_id", type: "INTEGER", notnull: 1 },
      { name: "variant_id", type: "INTEGER", notnull: 1 },
      { name: "mask_lo", type: "INTEGER", notnull: 1 },
      { name: "mask_hi", type: "INTEGER", notnull: 1 },
    ]);

    db.exec(`
      CREATE TABLE IF NOT EXISTS system_config (
          key        TEXT    PRIMARY KEY,
          value      TEXT    NOT NULL,
          updated_at INTEGER NOT NULL
      ) WITHOUT ROWID
    `);

    // `key` is notnull=1 for the same WITHOUT ROWID reason as decoded_messages.
    assertTableShape(db, "system_config", [
      { name: "key", type: "TEXT", notnull: 1 },
      { name: "value", type: "TEXT", notnull: 1 },
      { name: "updated_at", type: "INTEGER", notnull: 1 },
    ]);

    // SQLite has no "ADD COLUMN IF NOT EXISTS", so guard by hand against
    // running this migration twice.
    const messageColumns = db
      .prepare("PRAGMA table_info(messages)")
      .all() as Array<{ name: string }>;
    const hasSessionId = messageColumns.some(
      (col) => col.name === "session_id",
    );

    if (hasSessionId) {
      logger.warn("messages.session_id already exists, skipping ALTER");
    } else {
      db.exec(
        "ALTER TABLE messages ADD COLUMN session_id INTEGER REFERENCES aircraft(id)",
      );
    }
  });

  migrate();

  logger.warn("✓ Migration 16 complete");
}
