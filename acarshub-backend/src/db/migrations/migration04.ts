// ----------------------------------------------------------------------------
// GOD-02: extracted from db/migrate.ts.
// Migration 4: Create FTS table and triggers (94d97e655180)
// ----------------------------------------------------------------------------

import type Database from "better-sqlite3";
import { createLogger } from "../../utils/logger.js";
import {
  areFtsTriggersCorrect,
  createFtsTableAndTriggers,
  dropFtsTableAndTriggers,
  isFtsSchemaCorrect,
} from "./fts-helpers.js";

const logger = createLogger("db:migrate-04");

export function migration04_createFTS(db: Database.Database): void {
  logger.warn("Applying migration 4: create_messages_fts_table_and_triggers");

  const hasFTS = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='messages_fts'",
    )
    .get();

  if (hasFTS) {
    // The table already exists — it may have been created by the pre-Alembic
    // upgrade_db.py, which used an 8-column schema with limited triggers.
    // Both the Python Alembic migration and this migration have a plain
    // "skip if exists" guard, which preserved the stale schema for all
    // migrated databases.  Check now and rebuild if needed.
    const schemaOk = isFtsSchemaCorrect(db);
    const triggersOk = areFtsTriggersCorrect(db);

    if (schemaOk && triggersOk) {
      logger.warn("FTS table already exists with correct schema and triggers, skipping");
      return;
    }

    logger.warn(
      "FTS table exists but has stale schema or wrong/missing triggers — dropping and rebuilding",
      { schemaOk, triggersOk },
    );
    dropFtsTableAndTriggers(db);
    // Fall through to create the correct table below
  }

  createFtsTableAndTriggers(db);
}
