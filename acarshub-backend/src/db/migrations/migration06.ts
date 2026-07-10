// ----------------------------------------------------------------------------
// GOD-02: extracted from db/migrate.ts.
// Migration 6: Add message UIDs (204a67756b9a)
// ----------------------------------------------------------------------------

import type Database from "better-sqlite3";
import { createLogger } from "../../utils/logger.js";

const logger = createLogger("db:migrate-06");

export function migration06_addMessageUids(db: Database.Database): void {
  logger.warn("Applying migration 6: add_message_uids");

  const columns = db.prepare("PRAGMA table_info(messages)").all() as Array<{
    name: string;
  }>;
  const hasUid = columns.some((col) => col.name === "uid");

  if (hasUid) {
    logger.warn("UID column already exists, skipping");
    return;
  }

  db.exec("ALTER TABLE messages ADD COLUMN uid TEXT");

  // this used to add actual uuids but they are no longer required
  // still add the column as we can then unconditionally drop the column in migration14

  logger.warn("Creating unique index on uid column...");
  db.exec("CREATE UNIQUE INDEX ix_messages_uid ON messages(uid)");

  logger.warn("Applying migration 6: add_message_uids: done");
}
