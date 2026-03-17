# ACARS Hub - Database Size Optimization

This document describes the analysis, decisions, and implementation plan for reducing
on-disk database size. It covers two independent workstreams: dead index removal and
UUID-to-integer foreign key migration.

## Why This Exists

At 11M rows the `messages` table database file reaches approximately 5.7 GB. Roughly
1.7 GB of that is index overhead that provides zero query benefit. This document
captures the analysis that produced that conclusion and defines the migration steps
so any agent can implement them safely.

## Analysis Methodology

All conclusions below are derived from three sources:

1. `EXPLAIN QUERY PLAN` on every query path that touches `messages`
2. `dbstat` payload measurements on both `test.db` (108K rows) and `messages_large.db`
   (11.1M rows)
3. Direct inspection of `shouldUseFts()`, `searchWithLike()`, `searchWithFts()`,
   `pruneDatabase()`, and `initializeMessageCounters()` in the backend source

Projected sizes at 11M rows are extrapolated from the 108K-row `test.db` measurements
(scale factor ≈ 103×). Actual savings will vary with data distribution.

## Index Audit Results

### Indexes to Drop (Workstream 1)

These five indexes are never selected by the SQLite query planner for any query path
in the current codebase. They consume disk space with no offsetting benefit.

#### `ix_messages_msg_text` — ~593 MB at 11M rows

A B-tree index on the `msg_text` column. B-tree indexes cannot accelerate a `LIKE`
query with a leading wildcard (`LIKE '%value%'`), which is the only way `msg_text`
is queried in the LIKE fallback path. The FTS5 path (`messages_fts`) uses its own
inverted index and never touches this B-tree. The index was inherited from the
Python-era schema before FTS was added and was never removed.

Query plan evidence:

```text
-- LIKE path (searchWithLike)
EXPLAIN QUERY PLAN SELECT * FROM messages WHERE msg_text LIKE '%FAST%';
`--SCAN messages          ← full scan, index ignored
```

#### `ix_messages_time_icao` — ~177 MB at 11M rows

A composite index on `(msg_time DESC, icao)`. ICAO searches are explicitly routed
to the LIKE path via `shouldUseFts()` to support substring matching
(`LIKE '%value%'`). That leading wildcard defeats any B-tree index. When both `icao`
and a time range are filtered together the planner prefers the single-column
`ix_messages_icao` (higher selectivity: 2,580 distinct values) over this composite
regardless.

Query plan evidence:

```text
EXPLAIN QUERY PLAN SELECT * FROM messages WHERE icao='A1B2C3' AND msg_time > 1700000000;
`--SEARCH messages USING INDEX ix_messages_icao (icao=?)   ← composite ignored
```

#### `ix_messages_tail_flight` — ~154 MB at 11M rows

A composite index on `(tail, flight)`. Both fields are FTS-indexed
(`messages_fts`) and reach the planner via `searchWithFts()`. The LIKE fallback
uses `LIKE '%tail%'` (leading wildcard) which defeats the B-tree. There is no
code path that issues an exact-equality filter on both `tail` and `flight`
simultaneously outside of FTS.

#### `ix_messages_depa_dsta` — ~88 MB at 11M rows

A composite index on `(depa, dsta)`. Same reasoning as `tail_flight`: FTS handles
prefix searches, LIKE handles substring searches with a leading wildcard. Direct
exact-equality queries on both columns together do not exist in the codebase.

#### `ix_messages_aircraft_id` — ~74 MB at 11M rows

An index on `aircraft_id`. This column is `NULL` for all rows inserted before
migration 8 and remains `NULL` on all current rows because session linking
(v4.2, Phase 7) has not been implemented yet. The index is entirely null-valued
and provides no query acceleration.

**Note**: When v4.2 Phase 7 (ACARS Message Session Linking) is implemented,
`aircraft_id` will be populated and queries against it will be needed. The index
should be recreated at that point. Do not recreate it before Phase 7 ships.

### Index to Keep

#### `ix_messages_type_time` — ~206 MB at 11M rows

A composite index on `(message_type, msg_time DESC)`. This index is genuinely
useful and must not be dropped. It serves two distinct roles:

**Role 1 — Covering index for startup counter initialization.**
`initializeMessageCounters()` runs a `GROUP BY message_type` aggregation at
startup. The query planner satisfies this entirely from the index (covering index
scan) without touching the 2.4 GB main table. On a Raspberry Pi-class host with
a cold page cache this is the difference between a ~3-second startup and a
~30-second one.

```text
EXPLAIN QUERY PLAN SELECT message_type, COUNT(*) FROM messages GROUP BY message_type;
`--SCAN messages USING COVERING INDEX ix_messages_type_time
```

**Role 2 — Exact-equality filter on message type.**
When `messageType` is supplied as a search parameter (exact equality, not LIKE)
the planner uses this index with a covering scan, avoiding a full table read.

```text
EXPLAIN QUERY PLAN SELECT COUNT(*) FROM messages WHERE message_type = 'ACARS';
`--SEARCH messages USING COVERING INDEX ix_messages_type_time (message_type=?)
```

### Projected Savings from Index Drops

| Index                     | Projected saving |
| ------------------------- | ---------------- |
| `ix_messages_msg_text`    | ~593 MB          |
| `ix_messages_time_icao`   | ~177 MB          |
| `ix_messages_tail_flight` | ~154 MB          |
| `ix_messages_depa_dsta`   | ~88 MB           |
| `ix_messages_aircraft_id` | ~74 MB           |
| **Total**                 | **~1,086 MB**    |

## UUID-to-Integer Foreign Key Migration (Workstream 2)

### Why UUID Has a Cost

The `uid` column stores a 36-character UUID string (e.g. `a3f2c1d0-...`) for every
row. It is referenced by `alert_matches.message_uid` as a TEXT foreign key. At 11M
rows this adds up:

| Component                                  | Projected size           |
| ------------------------------------------ | ------------------------ |
| `uid` column data in `messages`            | ~382 MB                  |
| `ix_messages_uid` unique index             | ~456 MB                  |
| `message_uid` TEXT data in `alert_matches` | scales with alert volume |
| **Total**                                  | **~838 MB**              |

### What UUID Actually Provides

UUID was added in migration 6 (`add_message_uids`). It currently serves three
purposes:

1. **Alert FK linkage** — `alert_matches.message_uid` references `messages.uid`
2. **Frontend read-state tracking** — `readMessageUids: Set<string>` in `useAppStore`
   persists UIDs to `localStorage` so the UI can show read/unread badges
3. **FTS rowid bridging** — this turns out to be `id` (integer), not `uid`. The FTS
   table is declared with `content_rowid=id` and all FTS subqueries return `rowid`
   which the outer query resolves via `WHERE m.id IN (...)`. UUID plays no role here.

The only real benefit UUID provides over `id` is **opacity** — UUIDs are not
guessable or enumerable, which matters for public REST APIs. ACARS Hub is a local
Socket.IO application that never exposes row identifiers to untrusted callers.
Integer `id` is sufficient for all three purposes above.

### Why a Table Rebuild Is Not Required

`ALTER TABLE DROP COLUMN` in SQLite 3.35+ works without a table rebuild provided
the column has no inline constraint in the `CREATE TABLE` DDL. The `uid` column in
the current schema has **no inline `UNIQUE` constraint** — uniqueness is enforced
entirely by the separately-named `CREATE UNIQUE INDEX ix_messages_uid`. Dropping
that index first removes the blocker, after which `ALTER TABLE messages DROP COLUMN
uid` executes in-place.

The FTS content table (`messages_fts`) is unaffected because it references
`content_rowid=id`, not `uid`. The column drop does not touch the FTS schema or
triggers.

Verified against SQLite 3.51.2:

```text
-- Drop the index first (removes the only blocker)
DROP INDEX ix_messages_uid;
-- Column drop succeeds without table rebuild
ALTER TABLE messages DROP COLUMN uid;
-- FTS continues to function correctly afterwards
```

### Migration Steps

The migration is implemented as **migration 13** following the existing pattern in
`migrate.ts`. All steps run inside a single transaction. The `alert_matches` side
must be completed before the `messages` side because the backfill query reads
`messages.uid`.

#### Step 1 — Add integer FK column to `alert_matches` and backfill

```sql
ALTER TABLE alert_matches ADD COLUMN message_id INTEGER;

UPDATE alert_matches
SET message_id = (SELECT id FROM messages WHERE uid = message_uid);
```

The `UPDATE` uses `ix_messages_uid` (still present at this point) for the subquery
lookup — O(1) per row, not a full scan.

#### Step 2 — Index the new integer FK and drop the old text FK

```sql
CREATE INDEX ix_alert_matches_message_id ON alert_matches(message_id);
DROP INDEX ix_alert_matches_message_uid;
DROP INDEX ix_alert_matches_uid_term;
ALTER TABLE alert_matches DROP COLUMN message_uid;
```

#### Step 3 — Drop the `uid` index and column from `messages`

```sql
DROP INDEX ix_messages_uid;
ALTER TABLE messages DROP COLUMN uid;
```

#### Step 4 — Update `pruneDatabase()` subquery

The existing subquery uses `uid` as the correlation key:

```sql
-- Before
AND uid NOT IN (
  SELECT message_uid FROM alert_matches WHERE matched_at >= ?
)
```

After migration this becomes an integer comparison, which is faster:

```sql
-- After
AND id NOT IN (
  SELECT message_id FROM alert_matches WHERE matched_at >= ?
)
```

Query plan post-migration (integer FK, with indexes):

```text
|--SEARCH messages USING COVERING INDEX ix_messages_msgtime (msg_time<?)
`--LIST SUBQUERY 1
   |--SEARCH alert_matches USING INDEX ix_alert_matches_term_time (matched_at>?)
   `--CREATE BLOOM FILTER
```

This is identical in structure to the current plan and uses the same indexes.

### Code Changes Required

All changes are in the backend. The frontend change is a one-time localStorage
invalidation (see below).

**`acarshub-backend/src/db/migrate.ts`**

- Add `migration13_removeMessageUids()` function following the existing pattern
- Add entry to the `MIGRATIONS` array with a new revision hash
- Update `LATEST_REVISION` constant

**`acarshub-backend/src/db/schema.ts`**

- Remove `uid` field from the `messages` table definition
- Remove `uidIdx: uniqueIndex("ix_messages_uid")` from the indexes object
- Remove `uid` from `NewMessage` type (it is inferred from the schema)
- Change `alertMatches.messageUid` field from `text("message_uid")` to
  `integer("message_id")` (rename field to `messageId`)
- Replace `messageUidIdx` with `messageIdIdx` using the new integer column
- Remove `uidTermIdx: index("ix_alert_matches_uid_term")`

**`acarshub-backend/src/db/queries/messages.ts`**

- Remove `const uid = randomUUID()` and the `uid` field from the `db.insert()` call
  in `addMessage()`
- The `alertMetadata.uid` field must now use the inserted row's `id`. Use
  `db.insert(...).returning({ id: messages.id }).get()` to retrieve it and assign
  to `alertMetadata.uid` (kept as string via `String(inserted.id)`)
- Update `pruneDatabase()` subquery to use `messages.id` and
  `alertMatches.messageId`
- Remove `getMessageByUid()` — replace call sites with `getMessageById()` using the
  integer `id`
- Update `mapRawRowToMessage()` to remove the `uid` field mapping

**`acarshub-backend/src/db/queries/alerts.ts`**

- Update `addAlertMatch()` parameter type: `messageUid: string` →
  `messageId: number`
- Update `searchAlerts()`, `searchAlertsByTerm()`, `loadRecentAlerts()`: change
  `eq(alertMatches.messageUid, messages.uid)` JOIN condition to
  `eq(alertMatches.messageId, messages.id)`
- Update `deleteOldAlertMatches()` and `getAlertMatchesForMessage()` accordingly
- Update `regenerateAllAlertMatches()`: the `saveAlertMatch` inner function must
  pass `message.id` (integer) instead of `message.uid`

**`acarshub-backend/src/formatters/enrichment.ts`**

- Remove `"uid"` from the `PROTECTED_KEYS` set — it no longer exists on messages
  emitted from the backend
- The enriched message sent over Socket.IO should carry `id` instead. Update the
  protected keys set to include `"id"`.

**`acarshub-react/src/store/useAppStore.ts`**

- Change `readMessageUids: Set<string>` to `readMessageIds: Set<number>`
- Update `loadReadMessageUids` / `saveReadMessageUids` helpers and localStorage key
  (`"acarshub.readMessages"` → `"acarshub.readMessageIds"`) — changing the key
  causes a clean break with the old UUID-based stored data, so all messages appear
  unread on first load after upgrade. This is acceptable: it is cosmetic display
  state, not user data.
- Update all `uid`-keyed operations in `addMessage()`, `addAlertMessage()`,
  `markMessageAsRead()`, `markMessagesAsRead()`, `markAllMessagesAsRead()`,
  `markAllAlertsAsRead()`, `isMessageRead()`, `getUnreadCount()`, and
  `getUnreadAlertCount()` to use `message.id` (number)

**`acarshub-react/src/components/MessageCard.tsx`** and related components

- Any component that reads `message.uid` for the read-state key must switch to
  `message.id`

**`acarshub-types`**

- Update `AcarsMsg` interface: remove `uid?: string`, add `id: number`

### Frontend localStorage Behaviour on Upgrade

The localStorage key is intentionally renamed from `"acarshub.readMessages"` to
`"acarshub.readMessageIds"`. On first load after the upgrade:

- The old key is ignored (no migration needed — the data is stale UUID strings)
- All messages appear as unread
- As the user marks messages read, the new integer-keyed set is persisted

This is a one-time cosmetic reset, not data loss.

## Prior Migration Cleanup (Both Workstreams)

This is the most important part of the plan that the original implementation
sections omit: **existing migrations and the Drizzle SQL file must be updated
so that fresh databases never create the artifacts we are removing**. Without
this, a fresh install goes through migrations 1-12 creating all the dead
indexes and the UUID column, then migration 13/14 immediately drops them — pure
churn.

### The Three Sources That Create Dead Artifacts on Fresh Installs

#### Source 1 — `drizzle/0000_unknown_phalanx.sql`

This file is executed by `migration01_initialSchema()` via `drizzleMigrate()`
for every fresh database. It currently creates:

- `uid text(36) NOT NULL` in the `messages` table
- `CREATE UNIQUE INDEX messages_uid_unique ON messages (uid)` — auto-generated
  by Drizzle's `.unique()` column modifier
- `CREATE UNIQUE INDEX ix_messages_uid ON messages (uid)` — the named index
- `CREATE INDEX ix_messages_msg_text ON messages (msg_text)`
- `CREATE INDEX ix_messages_time_icao ON messages (msg_time, icao)`
- `CREATE INDEX ix_messages_tail_flight ON messages (tail, flight)`
- `CREATE INDEX ix_messages_depa_dsta ON messages (depa, dsta)`
- `CREATE INDEX ix_messages_aircraft_id ON messages (aircraft_id)`
- `message_uid text(36) NOT NULL` in `alert_matches`
- `CREATE INDEX ix_alert_matches_message_uid ON alert_matches (message_uid)`
- `CREATE INDEX ix_alert_matches_uid_term ON alert_matches (message_uid, term)`

All of these must be removed from `0000_unknown_phalanx.sql`. The `alert_matches`
table should use `message_id integer NOT NULL` in place of `message_uid`. The
`messages` table should not have a `uid` column at all.

**Important**: `drizzle/0000_unknown_phalanx.sql` is only ever executed once,
on a fresh database, by `drizzleMigrate()`. Editing it does not affect any
existing database — those are already past migration 1 and will not re-run it.
The Drizzle metadata in `drizzle/meta/` tracks what has been applied per-database
and will not re-apply a file that has already run.

**Also important**: Drizzle auto-generates a second unique index
(`messages_uid_unique`) from the `.unique()` column modifier on the `uid` field
in `schema.ts`. After removing `uid` from the schema, regenerate the SQL file
with `npx drizzle-kit generate` and verify the output contains none of the
dropped artifacts before committing. Do not hand-edit `meta/0000_snapshot.json`
— let `drizzle-kit` regenerate it.

#### Source 2 — `migration06_addMessageUids()`

This function adds the `uid` column to existing databases and backfills UUIDs
for all existing rows. After Workstream 2 ships, this migration becomes a
no-op for all databases: databases that already ran it have since had `uid`
removed by migration 13/14, and fresh databases never had `uid` at all.

The function must be **replaced with a no-op stub** that logs a skip message
and returns immediately. The stub must remain in the `MIGRATIONS` array at
index 5 to preserve the revision chain — removing it would break the
`startIndex` lookup in `runMigrations()` for any database whose
`alembic_version` is `204a67756b9a`.

```typescript
function migration06_addMessageUids(db: Database.Database): void {
  logger.info(
    "Migration 6 (add_message_uids) is a no-op after UUID removal — skipping",
  );
}
```

The import of `randomUUID` from `node:crypto` at the top of `migrate.ts` can
be removed once this is the only call site.

#### Source 3 — `migration07_createAlertMatches()`

This function creates the `alert_matches` table with a `message_uid TEXT`
foreign key column. After Workstream 2, this must create it with
`message_id INTEGER` instead, matching the post-migration schema.

Replace the `CREATE TABLE` SQL inside `migration07_createAlertMatches()`:

```sql
-- Before
CREATE TABLE alert_matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_uid TEXT NOT NULL,
  term TEXT NOT NULL,
  match_type TEXT NOT NULL,
  matched_at INTEGER NOT NULL
);
CREATE INDEX ix_alert_matches_message_uid ON alert_matches(message_uid);
```

```sql
-- After
CREATE TABLE alert_matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER NOT NULL,
  term TEXT NOT NULL,
  match_type TEXT NOT NULL,
  matched_at INTEGER NOT NULL
);
CREATE INDEX ix_alert_matches_message_id ON alert_matches(message_id);
```

Note that `ix_alert_matches_uid_term` was created in migration 8, not here.
Its replacement is handled in Source 4 below.

#### Source 4 — `migration08_finalOptimization()`

This function creates all five dead indexes plus `ix_alert_matches_uid_term`.
Each must be removed. The function already has `IF NOT EXISTS` guards via the
`indexNames` set check, so the remaining indexes (`ix_messages_type_time`,
`ix_alert_matches_term_time`) are unaffected.

Remove the following blocks from the `createIndexes` transaction:

```typescript
// Remove: Time + ICAO block
if (!indexNames.has("ix_messages_time_icao")) {
  db.exec(
    "CREATE INDEX ix_messages_time_icao ON messages(msg_time DESC, icao)",
  );
}

// Remove: Tail + Flight block
if (!indexNames.has("ix_messages_tail_flight")) {
  db.exec("CREATE INDEX ix_messages_tail_flight ON messages(tail, flight)");
}

// Remove: Departure + Destination block
if (!indexNames.has("ix_messages_depa_dsta")) {
  db.exec("CREATE INDEX ix_messages_depa_dsta ON messages(depa, dsta)");
}

// Remove: ix_alert_matches_uid_term block
if (!indexNames.has("ix_alert_matches_uid_term")) {
  db.exec(
    "CREATE INDEX ix_alert_matches_uid_term ON alert_matches(message_uid, term)",
  );
}
```

Also remove the `aircraft_id` column and index creation block:

```typescript
// Remove: aircraft_id block
if (!hasAircraftId) {
  db.exec("ALTER TABLE messages ADD COLUMN aircraft_id TEXT");
  db.exec("CREATE INDEX ix_messages_aircraft_id ON messages(aircraft_id)");
  logger.info("✓ aircraft_id column added");
} else {
  logger.info("aircraft_id column already exists, skipping");
}
```

**Note on `aircraft_id`**: The column itself is still needed — v4.2 Phase 7
populates it. Only the index is being dropped here. The column is still added
by the `ALTER TABLE` in migration 8 for existing databases that need it. What
changes is that the index is no longer created in migration 8. Phase 7 will
create the index when the column actually has data to index.

For existing databases that already have `ix_messages_aircraft_id` (created by
a prior run of migration 8), migration 13/14 drops it explicitly. For fresh
databases, it simply never gets created.

Also remove `ix_messages_msg_text` from the Drizzle-managed schema. This index
was created by `0000_unknown_phalanx.sql` on fresh databases; migration 8 does
not recreate it because it existed from migration 1. The drop in migration 13/14
handles existing databases. Fresh databases: never created after the SQL file
is updated.

#### Source 5 — `isAtInitialMigrationState()`

This function checks whether an existing database without an `alembic_version`
table matches the state after the original Python/Alembic migration 1. It
checks that `uid` and `aircraft_id` are **absent** from `messages` as part of
that fingerprint:

```typescript
// Must NOT have columns from later migrations
if (columnNames.has("uid") || columnNames.has("aircraft_id")) {
  return false;
}
```

After Workstream 2 ships, a fresh post-migration database also lacks `uid`.
This check remains correct — a post-migration database will have
`alembic_version` set and will not reach `isAtInitialMigrationState()` at all.
No change needed here.

### Summary of Prior Migration Changes

| Location                           | Change                                                         |
| ---------------------------------- | -------------------------------------------------------------- |
| `drizzle/0000_unknown_phalanx.sql` | Remove `uid`, dead indexes, `message_uid`; add `message_id`    |
| `drizzle/meta/`                    | Regenerate via `drizzle-kit generate` after schema change      |
| `migration06_addMessageUids()`     | Replace body with no-op stub                                   |
| `migration07_createAlertMatches()` | Use `message_id INTEGER` instead of `message_uid TEXT`         |
| `migration08_finalOptimization()`  | Remove 4 dead index blocks + `ix_alert_matches_uid_term` block |
| `migrate.ts` top-level imports     | Remove `randomUUID` import once migration 6 is stubbed         |

## Implementation Order

The two workstreams are independent and can be implemented in either order or in
parallel. Within Workstream 2 the steps are strictly ordered as described above.

### Workstream 1: Dead Index Removal (migration 13 or standalone)

Low risk. Each `DROP INDEX` is a single DDL statement with no data changes. Can be
batched into a single migration function or delivered as five separate ALTER
statements in one transaction.

**Deliverables**:

- Migration function `migration13_dropDeadIndexes()` (or integrated into migration
  13 alongside UUID removal — agent's choice, pick whichever keeps the migration
  file readable)
- Update `LATEST_REVISION` and `MIGRATIONS` array in `migrate.ts`
- Update `schema.ts` to remove the five dropped indexes from the Drizzle schema
  definition so `drizzle-kit` does not attempt to recreate them
- Update `migration08_finalOptimization()` to remove the four dead index creation
  blocks and the `aircraft_id` index creation (see Prior Migration Cleanup above)
- Update `drizzle/0000_unknown_phalanx.sql` to omit the five dead indexes
  (see Prior Migration Cleanup above) — regenerate via `drizzle-kit generate`
- `VACUUM` runs automatically after migration via the existing `runMigrations()`
  logic — no additional step needed

**Tests**:

- Migration applies cleanly on a fresh DB — verify via `PRAGMA index_list(messages)`
  that the dead indexes were never created in the first place
- Migration is idempotent (run twice, second run is a no-op via `IF EXISTS` guards)
- The five dropped indexes no longer appear in `PRAGMA index_list(messages)`
  after migration on an existing DB
- `ix_messages_type_time` is still present after migration (regression: must not be
  accidentally dropped)
- Query plan for `GROUP BY message_type` still shows
  `USING COVERING INDEX ix_messages_type_time` after migration
- Fresh DB test: run `migration01_initialSchema()` in isolation and confirm the
  five dead indexes are absent from `sqlite_master`

### Workstream 2: UUID Removal (migration 14, or 13 if indexes are a separate migration)

Medium risk. Involves backfill, two `DROP COLUMN` operations, and coordinated
changes across backend, types package, and frontend.

**Deliverables**:

- `migration14_removeMessageUids()` (or `migration13_` if indexes are separate)
- All code changes listed in the Code Changes Required section above
- Replace body of `migration06_addMessageUids()` with a no-op stub
- Update `migration07_createAlertMatches()` to create `message_id INTEGER` instead
  of `message_uid TEXT`
- Update `drizzle/0000_unknown_phalanx.sql`: remove `uid` column, remove
  `message_uid` column from `alert_matches`, add `message_id integer NOT NULL`
  to `alert_matches` — regenerate via `drizzle-kit generate`
- Remove `randomUUID` import from `migrate.ts`
- `just ci` passes with no TypeScript errors and all tests green

**Tests**:

- Migration applies cleanly on a fresh DB
- Fresh DB test: run `migration01_initialSchema()` in isolation and confirm `uid`
  is absent from `messages` and `alert_matches` uses `message_id`
- Fresh DB test: run all migrations 1-14 in sequence on an empty database and
  confirm the final schema matches `schema.ts` exactly
- Migration 6 stub test: confirm `migration06_addMessageUids()` does not add a
  `uid` column when called on a database that lacks it
- Migration 7 updated test: confirm `migration07_createAlertMatches()` creates
  `message_id INTEGER` and `ix_alert_matches_message_id`, not the old text column
- Existing DB migration: `alert_matches` rows correctly reference their parent
  `messages` row by integer `id` after backfill — spot-check several known-matched
  UIDs before and verify `message_id` resolves to the correct `messages.id`
- `uid` column is absent from `messages` after migration on an existing DB
- `message_uid` column is absent from `alert_matches` after migration
- `pruneDatabase()` correctly protects messages with recent alert matches and
  prunes messages without them — existing pruneDatabase tests must pass unchanged
  (the observable behaviour is identical; only the internal correlation key changes)
- Regression test: `pruneDatabase()` with > 999 protected messages does not throw
  (this regression was introduced and fixed previously; must remain fixed)
- `addMessage()` correctly inserts a message and returns integer `id` in
  `alertMetadata.uid`
- `searchAlerts()` and `searchAlertsByTerm()` correctly JOIN on integer FK
- FTS search (`searchWithFts()`) returns correct results after migration —
  `content_rowid=id` is unchanged, so this is a sanity check not a deep test
- Frontend: `markMessageAsRead()` stores integer `id` in `readMessageIds`
- Frontend: `isMessageRead()` correctly identifies a message by integer `id`
- Frontend: localStorage key `"acarshub.readMessageIds"` is written on mark-read
  (old key `"acarshub.readMessages"` is neither read nor written)

## Relationship to v4.2

Workstream 1 (dead indexes) has no interaction with v4.2 and can be shipped
independently at any time.

Workstream 2 (UUID removal) has one intersection with v4.2: Phase 7 (ACARS Message
Session Linking) sets `messages.aircraft_id` and expects to drop `ix_messages_aircraft_id`
as part of Workstream 1. Whichever ships first should leave a note in the migration
to avoid a double-drop. The simplest coordination is:

- If Workstream 1 ships before v4.2 Phase 7: drop `ix_messages_aircraft_id` in
  Workstream 1. Phase 7 creates a **new** index after populating the column.
- If v4.2 Phase 7 ships before Workstream 1: Phase 7 recreates the index after
  populating the column, and Workstream 1 must **not** drop it (remove it from the
  Workstream 1 drop list).

The agent implementing whichever workstream ships second is responsible for checking
the current state of `PRAGMA index_list(messages)` before generating DDL.
