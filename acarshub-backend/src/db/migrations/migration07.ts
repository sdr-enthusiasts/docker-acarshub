// ----------------------------------------------------------------------------
// GOD-02: extracted from db/migrate.ts.
// Migration 7: Create alert_matches table (171fe2c07bd9)
// ----------------------------------------------------------------------------

import type Database from "better-sqlite3";
import { createLogger } from "../../utils/logger.js";

const logger = createLogger("db:migrate-07");

export function migration07_createAlertMatches(db: Database.Database): void {
  logger.warn("Applying migration 7: create_alert_matches_table");

  const hasAlertMatches = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='alert_matches'",
    )
    .get();

  if (hasAlertMatches) {
    logger.warn("alert_matches table already exists, skipping");
    return;
  }

  // Wrap in transaction
  const migrate = db.transaction(() => {
    db.exec(`
      CREATE TABLE alert_matches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_uid TEXT NOT NULL,
        term TEXT NOT NULL,
        match_type TEXT NOT NULL,
        matched_at INTEGER NOT NULL
      );
      CREATE INDEX ix_alert_matches_message_uid ON alert_matches(message_uid);
    `);

    const hasMessagesSaved = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='messages_saved'",
      )
      .get();

    if (hasMessagesSaved) {
      logger.warn("Dropping old messages_saved table");
      db.exec("DROP TABLE messages_saved");
    }
  });

  migrate();
}
