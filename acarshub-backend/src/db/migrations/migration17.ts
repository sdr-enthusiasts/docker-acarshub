// ----------------------------------------------------------------------------
// Migration 17: messages_session_id_index (5e6f7a8b9c0d)
//
// Creates ix_messages_session_id on messages(session_id) — the index Phase 6
// ("ACARS Message Session Linking", agent-docs/V4.3.md) needs now that
// messages.session_id is actually being populated at ingest.
//
// Why this index, and why now (see agent-docs/V4.3.md "Session Identifier
// Type"): SQLite enforces the `NO ACTION` foreign key on
// `messages.session_id REFERENCES aircraft(id)` (migration16.ts) by scanning
// the *child* table (messages) for referencing rows every time a parent
// (aircraft) row is deleted. Without this index, every session prune
// (Phase 6's `pruneDatabase()` extension) would table-scan `messages` —
// 11M rows in the production reference corpus — to prove no message still
// points at the session being removed. `EXPLAIN QUERY PLAN` before/after
// (and the measured byte cost of the index itself) are recorded in the PR
// description per agent-docs/V4.3.md "No Index Without Evidence"; this file
// only records the structural justification.
//
// Ordering requirement satisfied within this one phase: agent-docs/V4.3.md
// notes the index must exist before anything ever deletes from `aircraft`.
// Phase 6 is simultaneously the first phase to populate messages.session_id,
// the first to prune `aircraft` rows, and (via this migration) the phase
// that creates the index — so the required "index before delete" ordering
// holds as long as this migration is applied before Phase 6's prune.ts
// change ships, which it is: this file lands in the same phase.
//
// Do NOT add any other index here. See agent-docs/V4.3.md "No Index Without
// Evidence" — every index must be backed by an EXPLAIN QUERY PLAN showing
// the planner actually selects it for a real query.
// ----------------------------------------------------------------------------

import type Database from "better-sqlite3";
import { createLogger } from "../../utils/logger.js";

const logger = createLogger("db:migrate-17");

const INDEX_NAME = "ix_messages_session_id";
const INDEX_DDL = `CREATE INDEX IF NOT EXISTS ${INDEX_NAME} ON messages(session_id)`;

/**
 * Collapse whitespace and case so trivial formatting differences (extra
 * spaces around parens/commas, keyword casing) are not mistaken for shape
 * drift. SQLite stores `sqlite_master.sql` as the verbatim text the index
 * was created with (minus `IF NOT EXISTS`, which it strips), so two
 * functionally identical `CREATE INDEX` statements typed slightly
 * differently would otherwise fail this comparison for no real reason.
 */
function normalizeIndexSql(sql: string): string {
  return sql
    .toLowerCase()
    .replace(/if\s+not\s+exists/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*\(\s*/g, "(")
    .replace(/\s*\)\s*/g, ")")
    .replace(/\s*,\s*/g, ",")
    .trim();
}

/**
 * `CREATE INDEX IF NOT EXISTS` silently accepts an index that already
 * exists under the same name but with a *different* definition (different
 * table, different columns, different column order) — exactly the kind of
 * drift migration16.ts's `assertTableShape` guards against for tables. v4.3
 * migrations are editable until release (agent-docs/V4.3.md "Migrations
 * Under This Plan Are Mutable Until v4.3 Ships"), so a developer holding a
 * database from an earlier draft of this migration could have
 * `ix_messages_session_id` pointing at the wrong column, and without this
 * check the migration would complete silently and the drift would survive
 * as a permanently-wrong index.
 */
function assertIndexShape(db: Database.Database): void {
  // SQLite resolves object names case-insensitively (CREATE INDEX IF NOT
  // EXISTS recognizes 'IX_MESSAGES_SESSION_ID' as the same object as
  // 'ix_messages_session_id'), but sqlite_master.name is stored with
  // whatever case it was created with and a plain `name = ?` comparison is
  // case-sensitive. Matching case-insensitively here keeps this guard from
  // missing a drifted index purely because of a naming-case difference.
  const row = db
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'index' AND name = ? COLLATE NOCASE",
    )
    .get(INDEX_NAME) as { sql: string } | undefined;

  if (!row) {
    return;
  }

  if (normalizeIndexSql(row.sql) !== normalizeIndexSql(INDEX_DDL)) {
    throw new Error(
      `Index '${INDEX_NAME}' already exists with a definition this migration did not create: ` +
        `found ${JSON.stringify(row.sql)}, expected (normalized) ${JSON.stringify(normalizeIndexSql(INDEX_DDL))}. ` +
        "This normally means a pre-release draft of migration 17 was applied to this " +
        "database. v4.3 migrations are editable until release, so the fix is to discard " +
        "this development database and re-migrate from scratch.",
    );
  }
}

export function migration17_messagesSessionIdIndex(
  db: Database.Database,
): void {
  logger.warn("Applying migration 17: messages_session_id_index");

  const migrate = db.transaction(() => {
    assertIndexShape(db);
    db.exec(INDEX_DDL);
  });

  migrate();

  logger.warn("✓ Migration 17 complete");
}
