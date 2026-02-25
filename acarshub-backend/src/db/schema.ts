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
 * - messages: Main ACARS message storage (with UID)
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
 * - uid: UNIQUE index for fast UID lookups
 * - depa, dsta, flight, freq, icao, label, msg_text, msgno, tail: Non-unique for searches
 * - aircraft_id: For future aircraft tracking feature (v5+)
 * - Composite indexes for common query patterns (added in migration 8)
 */
export const messages = sqliteTable(
  "messages",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    uid: text("uid", { length: 36 }).notNull().unique(),
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
    aircraftId: text("aircraft_id", { length: 36 }), // Added in migration 8, nullable for future use
  },
  (table) => ({
    // Single-column indexes
    uidIdx: uniqueIndex("ix_messages_uid").on(table.uid),
    depaIdx: index("ix_messages_depa").on(table.depa),
    dstaIdx: index("ix_messages_dsta").on(table.dsta),
    flightIdx: index("ix_messages_flight").on(table.flight),
    freqIdx: index("ix_messages_freq").on(table.freq),
    icaoIdx: index("ix_messages_icao").on(table.icao),
    labelIdx: index("ix_messages_label").on(table.label),
    msgTextIdx: index("ix_messages_msg_text").on(table.text),
    msgnoIdx: index("ix_messages_msgno").on(table.msgno),
    tailIdx: index("ix_messages_tail").on(table.tail),
    aircraftIdIdx: index("ix_messages_aircraft_id").on(table.aircraftId),
    // Composite indexes (added in migration 8 for query optimization)
    timeIcaoIdx: index("ix_messages_time_icao").on(table.time, table.icao),
    tailFlightIdx: index("ix_messages_tail_flight").on(
      table.tail,
      table.flight,
    ),
    depaDstaIdx: index("ix_messages_depa_dsta").on(table.depa, table.dsta),
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
    messageUid: text("message_uid", { length: 36 }).notNull(),
    term: text("term", { length: 32 }).notNull(),
    matchType: text("match_type", { length: 32 }).notNull(),
    matchedAt: integer("matched_at").notNull(), // Unix timestamp when match was created
  },
  (table) => ({
    messageUidIdx: index("ix_alert_matches_message_uid").on(table.messageUid),
    // Composite indexes (added in migration 8)
    termTimeIdx: index("ix_alert_matches_term_time").on(
      table.term,
      table.matchedAt,
    ),
    uidTermIdx: index("ix_alert_matches_uid_term").on(
      table.messageUid,
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
 * Stores message counts at multiple resolutions:
 * - 1min: 1-minute resolution (25 hours of data)
 * - 5min: 5-minute resolution (1 month of data)
 * - 1hour: 1-hour resolution (6 months of data)
 * - 6hour: 6-hour resolution (3 years of data)
 *
 * Data sources match RRD structure:
 * - ACARS, VDLM, HFDL, IMSL, IRDM (per-decoder counts)
 * - TOTAL (sum of all decoders)
 * - ERROR (error count)
 *
 * Indexes:
 * - timestamp + resolution: For efficient time-range queries
 * - resolution: For filtering by resolution
 */
export const timeseriesStats = sqliteTable(
  "timeseries_stats",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    timestamp: integer("timestamp").notNull(), // Unix timestamp
    resolution: text("resolution", {
      enum: ["1min", "5min", "1hour", "6hour"],
    }).notNull(),
    acarsCount: integer("acars_count").notNull().default(0),
    vdlmCount: integer("vdlm_count").notNull().default(0),
    hfdlCount: integer("hfdl_count").notNull().default(0),
    imslCount: integer("imsl_count").notNull().default(0),
    irdmCount: integer("irdm_count").notNull().default(0),
    totalCount: integer("total_count").notNull().default(0),
    errorCount: integer("error_count").notNull().default(0),
    createdAt: integer("created_at")
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (table) => ({
    timestampResolutionIdx: index("idx_timeseries_timestamp_resolution").on(
      table.timestamp,
      table.resolution,
    ),
    resolutionIdx: index("idx_timeseries_resolution").on(table.resolution),
  }),
);

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
