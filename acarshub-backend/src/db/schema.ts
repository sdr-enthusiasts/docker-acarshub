/**
 * Database schema for ACARS Hub using Drizzle ORM
 *
 * This schema mirrors the Python SQLAlchemy models in rootfs/webapp/acarshub_database.py
 * and implements the migrations from rootfs/webapp/migrations/versions/
 *
 * Key differences from Python:
 * - Uses Drizzle ORM instead of SQLAlchemy
 * - TypeScript types instead of Python types
 * - SQLite-specific types and constraints
 *
 * Schema includes:
 * - messages: Main ACARS message storage
 * - alert_matches: Normalized alert junction table (replaces messages_saved)
 * - Frequency statistics tables (per decoder type)
 * - Signal level statistics tables (per decoder type)
 * - Message counts and alert statistics
 */

import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";


// ============================================================================
// Main Messages Table
// ============================================================================

/**
 * Primary table for storing ACARS messages
 *
 * Indexes:
 * - icao, msgno: Non-unique for searches
 * - Composite index for common query patterns (added in migration 8)
 *
 * Migration 15 (drop_unnecessary_indexes2, commit c994e8e4) dropped the
 * single-column indexes on depa, dsta, flight, freq, label, and tail —
 * every search against those columns goes through FTS
 * (`messages_fts`) or a leading-wildcard LIKE, neither of which a B-tree
 * index on the bare column can accelerate. schema.ts is Drizzle's schema
 * DSL, not the source of the real DDL (this project migrates by hand, see
 * db/migrations/), so this comment and the index list below must be kept
 * in sync with the migrations by hand too — this exact drift (schema.ts
 * still declaring six indexes migration 15 had already dropped) is what
 * db/__tests__/schema.test.ts's smoke test caught.
 */
export const messages = sqliteTable(
  "messages",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    messageType: text("message_type", { length: 32 }).notNull(),
    time: integer("msg_time").notNull(), // Unix timestamp
    stationId: text("station_id", { length: 32 }).notNull(),
    toaddr: text("toaddr", { length: 32 }).notNull(),
    fromaddr: text("fromaddr", { length: 32 }).notNull(),
    depa: text("depa", { length: 32 }).notNull(),
    dsta: text("dsta", { length: 32 }).notNull(),
    eta: text("eta", { length: 32 }).notNull(),
    gtout: text("gtout", { length: 32 }).notNull(),
    gtin: text("gtin", { length: 32 }).notNull(),
    wloff: text("wloff", { length: 32 }).notNull(),
    wlin: text("wlin", { length: 32 }).notNull(),
    lat: text("lat", { length: 32 }).notNull(),
    lon: text("lon", { length: 32 }).notNull(),
    alt: text("alt", { length: 32 }).notNull(),
    text: text("msg_text").notNull(),
    tail: text("tail", { length: 32 }).notNull(),
    flight: text("flight", { length: 32 }).notNull(),
    icao: text("icao", { length: 32 }).notNull(),
    freq: text("freq", { length: 32 }).notNull(),
    ack: text("ack", { length: 32 }).notNull(),
    mode: text("mode", { length: 32 }).notNull(),
    label: text("label", { length: 32 }).notNull(),
    blockId: text("block_id", { length: 32 }).notNull(),
    msgno: text("msgno", { length: 32 }).notNull(),
    isResponse: text("is_response", { length: 32 }).notNull(),
    isOnground: text("is_onground", { length: 32 }).notNull(),
    error: text("error", { length: 32 }).notNull(),
    libacars: text("libacars").notNull(),
    level: text("level", { length: 32 }).notNull(),
    aircraftId: text("aircraft_id", { length: 36 }), // Added in migration 8, nullable for future use; dead column, never written, superseded by sessionId
    sessionId: integer("session_id"), // Added in migration 16; FK to aircraft(id), NO ACTION on delete — see aircraft table comment below
  },
  (table) => ({
    // Single-column indexes. depa/dsta/flight/freq/label/tail were dropped
    // by migration 15 — see the table-level comment above.
    icaoIdx: index("ix_messages_icao").on(table.icao),
    msgnoIdx: index("ix_messages_msgno").on(table.msgno),
    // Composite index (added in migration 8 for query optimization)
    typeTimeIdx: index("ix_messages_type_time").on(
      table.messageType,
      table.time,
    ),
  }),
);

// ============================================================================
// Alert Matches Table (Normalized)
// ============================================================================

/**
 * Normalized junction table for alert matches
 *
 * Replaces the denormalized messages_saved table.
 * Links messages to alert terms without duplicating message data.
 *
 * When a message matches multiple terms, there are multiple rows here
 * but only one row in the messages table.
 */
export const alertMatches = sqliteTable(
  "alert_matches",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    messageId: integer("message_id").notNull(),
    term: text("term", { length: 32 }).notNull(),
    matchType: text("match_type", { length: 32 }).notNull(),
    matchedAt: integer("matched_at").notNull(), // Unix timestamp when match was created
  },
  (table) => ({
    messageIdIdx: index("ix_alert_matches_message_id").on(table.messageId),
    // Composite indexes (added in migration 8)
    termTimeIdx: index("ix_alert_matches_term_time").on(
      table.term,
      table.matchedAt,
    ),
    idTermIdx: index("ix_alert_matches_id_term").on(
      table.messageId,
      table.term,
    ),
  }),
);

// ============================================================================
// Frequency Statistics Tables (Per Decoder Type)
// ============================================================================

/**
 * Frequency statistics for ACARS decoder
 */
export const freqsAcars = sqliteTable("freqs_acars", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  freq: text("freq", { length: 32 }),
  count: integer("count"),
});

/**
 * Frequency statistics for VDLM2 decoder
 */
export const freqsVdlm2 = sqliteTable("freqs_vdlm2", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  freq: text("freq", { length: 32 }),
  count: integer("count"),
});

/**
 * Frequency statistics for HFDL decoder
 */
export const freqsHfdl = sqliteTable("freqs_hfdl", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  freq: text("freq", { length: 32 }),
  count: integer("count"),
});

/**
 * Frequency statistics for IMSL decoder
 */
export const freqsImsl = sqliteTable("freqs_imsl", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  freq: text("freq", { length: 32 }),
  count: integer("count"),
});

/**
 * Frequency statistics for IRDM decoder
 */
export const freqsIrdm = sqliteTable("freqs_irdm", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  freq: text("freq", { length: 32 }),
  count: integer("count"),
});

// ============================================================================
// Signal Level Statistics Tables (Per Decoder Type)
// ============================================================================

/**
 * Signal level statistics for ACARS decoder
 */
export const levelAcars = sqliteTable("level_acars", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  level: real("level"),
  count: integer("count"),
});

/**
 * Signal level statistics for VDLM2 decoder
 */
export const levelVdlm2 = sqliteTable("level_vdlm2", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  level: real("level"),
  count: integer("count"),
});

/**
 * Signal level statistics for HFDL decoder
 */
export const levelHfdl = sqliteTable("level_hfdl", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  level: real("level"),
  count: integer("count"),
});

/**
 * Signal level statistics for IMSL decoder
 */
export const levelImsl = sqliteTable("level_imsl", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  level: real("level"),
  count: integer("count"),
});

/**
 * Signal level statistics for IRDM decoder
 */
export const levelIrdm = sqliteTable("level_irdm", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  level: real("level"),
  count: integer("count"),
});

// ============================================================================
// Message Count Statistics
// ============================================================================

/**
 * Global count of all messages (logged to database)
 */
export const messagesCount = sqliteTable("count", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  total: integer("total"), // Total logged messages
  errors: integer("errors"), // Messages with errors
  good: integer("good"), // Messages without errors
});

/**
 * Count of messages received but not logged to database
 */
export const messagesCountDropped = sqliteTable("nonlogged_count", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nonloggedErrors: integer("errors"),
  nonloggedGood: integer("good"),
});

// ============================================================================
// Alert Statistics and Configuration
// ============================================================================

/**
 * Statistics for alert term matches
 */
export const alertStats = sqliteTable("alert_stats", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  term: text("term", { length: 32 }),
  count: integer("count"),
});

/**
 * Terms that should NOT trigger alerts (blacklist)
 *
 * If a message matches both an alert term and an ignore term,
 * it is NOT flagged as an alert.
 */
export const ignoreAlertTerms = sqliteTable("ignore_alert_terms", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  term: text("term", { length: 32 }),
});

// ============================================================================
// Time-Series Statistics (RRD Migration)
// ============================================================================

/**
 * Time-series statistics table for storing historical message rate data
 *
 * Replaces RRD (Round Robin Database) with SQLite for simpler management.
 * All data is stored at 1-minute resolution — the original multi-resolution
 * design (1min / 5min / 1hour / 6hour) was abandoned when the RRD importer
 * was written to expand all coarser archives into 1-minute buckets before
 * inserting. The stats-writer likewise only ever writes 1-minute rows.
 *
 * Migration 12 removed the vestigial `id` and `resolution` columns and
 * promoted `timestamp` to INTEGER PRIMARY KEY. In SQLite an INTEGER PRIMARY
 * KEY is the rowid alias — the most storage-efficient key possible, with no
 * separate index B-tree. This also dropped:
 *   - idx_timeseries_resolution  (was never used by any query)
 *   - idx_timeseries_timestamp_resolution  (superseded by the PK B-tree)
 *
 * Data sources:
 * - ACARS, VDLM, HFDL, IMSL, IRDM (per-decoder counts)
 * - TOTAL (sum of all decoders)
 * - ERROR (error count)
 *
 * Inserts use onConflictDoNothing() so re-importing the same data is a
 * safe no-op rather than a duplication.
 */
export const timeseriesStats = sqliteTable("timeseries_stats", {
  timestamp: integer("timestamp").primaryKey(), // Unix timestamp (seconds), unique PK
  acarsCount: integer("acars_count").notNull().default(0),
  vdlmCount: integer("vdlm_count").notNull().default(0),
  hfdlCount: integer("hfdl_count").notNull().default(0),
  imslCount: integer("imsl_count").notNull().default(0),
  irdmCount: integer("irdm_count").notNull().default(0),
  totalCount: integer("total_count").notNull().default(0),
  errorCount: integer("error_count").notNull().default(0),
});

// ============================================================================
// RRD Import Registry
// ============================================================================

/**
 * Registry of RRD files that have been successfully imported.
 *
 * WHY THIS EXISTS
 * ---------------
 * The original "already migrated" signal was the presence of an .rrd.back
 * file on disk.  If a user renames .rrd.back back to .rrd, the check misses
 * it and the importer re-runs, doubling every historical row.
 *
 * This table stores a SHA-256 hash of each successfully imported RRD file's
 * byte content.  On startup the importer hashes the candidate .rrd file and
 * checks here before doing any work.  Since the hash is content-based, it
 * catches re-imports regardless of what the file is named.
 *
 * The .rrd.back rename still happens (belt-and-suspenders), but the hash
 * check is the authoritative guard.
 */
export const rrdImportRegistry = sqliteTable(
  "rrd_import_registry",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    fileHash: text("file_hash").notNull().unique(), // SHA-256 hex of file content
    rrdPath: text("rrd_path").notNull(), // Original path at import time
    importedAt: integer("imported_at").notNull(), // Unix ms timestamp
    rowsImported: integer("rows_imported").notNull().default(0),
  },
  (table) => ({
    fileHashIdx: uniqueIndex("idx_rrd_import_registry_hash").on(table.fileHash),
  }),
);

// ============================================================================
// v4.3 Session and Decode Tables (Migration 16)
// ============================================================================

/**
 * Flight session registry.
 *
 * Each row is one flight session; two appearances of the same aircraft are
 * two rows (see agent-docs/V4.3.md "Session Lifecycle"). `id` is the FK
 * target for `messages.sessionId` and is AUTOINCREMENT so a pruned session's
 * rowid is never reused — reuse would let a stale `messages.session_id`
 * silently re-point at a different, newer session.
 *
 * Exactly one index exists here: `ix_aircraft_active_hex`. A second index on
 * `last_seen` (`ix_aircraft_last_seen`) was measured and rejected — see
 * migration16.ts and agent-docs/V4.3.md for the numbers. Do not add it back
 * without new measurement.
 *
 * Drizzle cannot express `WITHOUT ROWID`; this table is a normal rowid table
 * so that divergence does not apply here. The real DDL lives in
 * migration16.ts — this file is not the source of truth (see the comment on
 * the `messages` table above).
 */
export const aircraft = sqliteTable(
  "aircraft",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    icaoHex: text("icao_hex"),
    callsign: text("callsign"),
    tail: text("tail"),
    firstSeen: integer("first_seen").notNull(),
    lastSeen: integer("last_seen").notNull(),
    isActive: integer("is_active").notNull().default(1),
    sessionType: text("session_type").notNull().default("adsb"),
    pairingMethod: text("pairing_method"),
    traceState: text("trace_state").notNull().default("none"),
  },
  (table) => ({
    activeHexIdx: index("ix_aircraft_active_hex").on(
      table.isActive,
      table.icaoHex,
    ),
  }),
);

/**
 * Interned `(decoder_name, decoder_version, description)` triples referenced
 * by `decodedMessages.variantId`. Measured at ~70 distinct triples in
 * production — a single 4 KB page. `description` is the searchable
 * message-type name ("Ground Station Squitter", "Fault Log Report"); it lives
 * here rather than per-message because it is nearly a function of the plugin,
 * which is what makes message-type search cost almost nothing.
 *
 * The unique index below is also the lookup path for upsert-on-insert; there
 * is no separate index beside it. It is a named index rather than an inline
 * UNIQUE so it can be widened later without rebuilding the table.
 */
export const decoderVariant = sqliteTable(
  "decoder_variant",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    // Empty-string sentinel, not NULL, for "no decoder matched". SQLite treats
    // NULLs as distinct under UNIQUE, so a nullable column would permit
    // duplicate rows and break find-or-create lookups. See migration16.ts.
    decoderName: text("decoder_name").notNull().default(""),
    decoderVersion: text("decoder_version").notNull(),
    description: text("description").notNull().default(""),
  },
  (table) => ({
    variantKeyIdx: uniqueIndex("ix_decoder_variant_key").on(
      table.decoderName,
      table.decoderVersion,
      table.description,
    ),
  }),
);

/**
 * Stable field-label to bit-position assignment for `decodedMessages.maskLo` /
 * `maskHi`. `id` IS the bit position, so rows are never renumbered or deleted;
 * a retired field leaves its bit permanently unused. Without this table the
 * masks would be meaningless across restarts.
 *
 * Drizzle cannot express `WITHOUT ROWID` or the `CHECK(id BETWEEN 0 AND 125)`
 * bound; migration16.ts carries both.
 */
export const decodedField = sqliteTable(
  "decoded_field",
  {
    id: integer("id").primaryKey(), // bit position, 0-125
    label: text("label").notNull(),
  },
  (table) => ({
    labelIdx: uniqueIndex("ix_decoded_field_label").on(table.label),
  }),
);

/**
 * Compact search index over decoder output. A row exists only for messages
 * that actually produced decoder output, so absence means "no decoder output",
 * not "not yet processed".
 *
 * Deliberately stores NO decoded text: classification (`decoderVariant.
 * description`) plus a field-presence bitmask carries ~95% of the measured
 * search value at ~9x less storage than persisting decoded text with an FTS
 * index over it. Decoded text for display is produced on read. See
 * agent-docs/V4.3.md "Open Question 7".
 *
 * `maskLo` / `maskHi` are a 126-bit set of `decodedField.id` values, split
 * across two columns because SQLite's INTEGER is signed 64-bit and 64 distinct
 * labels already exist in production. Bit n of `maskLo` is field id n; bit n
 * of `maskHi` is field id n + 63.
 *
 * Drizzle cannot express `WITHOUT ROWID`; migration16.ts is the source of
 * truth for the on-disk DDL (see the comment on the `messages` table above).
 * No index exists beside the primary key — `ix_decoded_version_level` was
 * measured and rejected, see migration16.ts.
 */
export const decodedMessages = sqliteTable("decoded_messages", {
  messageId: integer("message_id").primaryKey(), // REFERENCES messages(id) ON DELETE CASCADE
  variantId: integer("variant_id").notNull(), // REFERENCES decoder_variant(id)
  maskLo: integer("mask_lo").notNull().default(0), // decoded_field ids 0-62
  maskHi: integer("mask_hi").notNull().default(0), // decoded_field ids 63-125
});

/**
 * General-purpose persistent key-value store for values that must survive
 * restarts and are not appropriate as environment variables (e.g. the
 * installed decoder version, reprocessor status/cursor — see
 * agent-docs/V4.3.md "system_config").
 *
 * Drizzle cannot express `WITHOUT ROWID`; migration16.ts is the source of
 * truth for that attribute, as with `decodedMessages` above.
 */
export const systemConfig = sqliteTable("system_config", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

// ============================================================================
// TypeScript Types (Inferred from Schema)
// ============================================================================

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;

export type AlertMatch = typeof alertMatches.$inferSelect;
export type NewAlertMatch = typeof alertMatches.$inferInsert;

export type FreqAcars = typeof freqsAcars.$inferSelect;
export type FreqVdlm2 = typeof freqsVdlm2.$inferSelect;
export type FreqHfdl = typeof freqsHfdl.$inferSelect;
export type FreqImsl = typeof freqsImsl.$inferSelect;
export type FreqIrdm = typeof freqsIrdm.$inferSelect;

export type LevelAcars = typeof levelAcars.$inferSelect;
export type LevelVdlm2 = typeof levelVdlm2.$inferSelect;
export type LevelHfdl = typeof levelHfdl.$inferSelect;
export type LevelImsl = typeof levelImsl.$inferSelect;
export type LevelIrdm = typeof levelIrdm.$inferSelect;

export type MessageCount = typeof messagesCount.$inferSelect;
export type MessageCountDropped = typeof messagesCountDropped.$inferSelect;

export type AlertStat = typeof alertStats.$inferSelect;
export type IgnoreAlertTerm = typeof ignoreAlertTerms.$inferSelect;

export type TimeseriesStat = typeof timeseriesStats.$inferSelect;
export type NewTimeseriesStat = typeof timeseriesStats.$inferInsert;

export type RrdImportRegistryEntry = typeof rrdImportRegistry.$inferSelect;
export type NewRrdImportRegistryEntry = typeof rrdImportRegistry.$inferInsert;

export type Aircraft = typeof aircraft.$inferSelect;
export type NewAircraft = typeof aircraft.$inferInsert;

export type DecoderVariant = typeof decoderVariant.$inferSelect;
export type NewDecoderVariant = typeof decoderVariant.$inferInsert;

export type DecodedField = typeof decodedField.$inferSelect;
export type NewDecodedField = typeof decodedField.$inferInsert;

export type DecodedMessage = typeof decodedMessages.$inferSelect;
export type NewDecodedMessage = typeof decodedMessages.$inferInsert;

export type SystemConfig = typeof systemConfig.$inferSelect;
export type NewSystemConfig = typeof systemConfig.$inferInsert;
