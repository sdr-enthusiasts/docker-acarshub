// ----------------------------------------------------------------------------
// GOD-02: extracted from db/migrate.ts.
// Migration 8: Final optimization (40fd0618348d)
// ----------------------------------------------------------------------------

import type Database from "better-sqlite3";
import { createLogger } from "../../utils/logger.js";

const logger = createLogger("db:migrate-08");

export function migration08_finalOptimization(db: Database.Database): void {
  logger.warn("Applying migration 8: final_v4_optimization");

  // 1. Add aircraft_id column for future aircraft tracking
  logger.warn("Adding aircraft_id column for future use...");
  const columns = db.prepare("PRAGMA table_info(messages)").all() as Array<{
    name: string;
  }>;
  const hasAircraftId = columns.some((col) => col.name === "aircraft_id");

  if (!hasAircraftId) {
    db.exec("ALTER TABLE messages ADD COLUMN aircraft_id TEXT");
    logger.warn("✓ aircraft_id column added");
  } else {
    logger.warn("aircraft_id column already exists, skipping");
  }

  // 2. Create composite indexes for query optimization
  logger.warn("Creating composite indexes for query optimization...");

  const indexes = db
    .prepare("SELECT name FROM sqlite_master WHERE type='index'")
    .all() as Array<{ name: string }>;
  const indexNames = new Set(indexes.map((idx) => idx.name));

  // Wrap index creation in transaction
  const createIndexes = db.transaction(() => {
    // Message type + Time: filtered time-series queries
    if (!indexNames.has("ix_messages_type_time")) {
      db.exec(
        "CREATE INDEX ix_messages_type_time ON messages(message_type, msg_time DESC)",
      );
    }

    // Alert matches: Term + time for efficient alert browsing
    if (!indexNames.has("ix_alert_matches_term_time")) {
      db.exec(
        "CREATE INDEX ix_alert_matches_term_time ON alert_matches(term, matched_at DESC)",
      );
    }

    // Alert matches: Message UID + Term for checking specific matches
    if (!indexNames.has("ix_alert_matches_uid_term")) {
      db.exec(
        "CREATE INDEX ix_alert_matches_uid_term ON alert_matches(message_uid, term)",
      );
    }
  });

  createIndexes();

  logger.warn("✓ Composite indexes created");

  logger.warn("v4 migration complete - database is optimized for production");
}
