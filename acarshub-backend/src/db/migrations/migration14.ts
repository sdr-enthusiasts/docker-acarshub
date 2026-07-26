// ----------------------------------------------------------------------------
// GOD-02: extracted from db/migrate.ts.
// Migration 14: remove_uuid (803398f85958)
// ----------------------------------------------------------------------------

import type Database from "better-sqlite3";
import { createLogger } from "../../utils/logger.js";

const logger = createLogger("db:migrate-14");

export function migration14_removeUuid(
  db: Database.Database,
): void {
  logger.warn(
    "Applying migration 14: remove_uuid",
  );

  const migrate = db.transaction(() => {
    db.exec("ALTER TABLE alert_matches ADD COLUMN message_id INTEGER;");
    db.exec("CREATE INDEX IF NOT EXISTS ix_alert_matches_message_id ON alert_matches(message_id);");
    db.exec("CREATE INDEX IF NOT EXISTS ix_alert_matches_id_term ON alert_matches(message_id, term);");

    db.exec(`
        UPDATE alert_matches
        SET message_id = messages.id
        FROM messages
        WHERE alert_matches.message_uid = messages.uid
    ;`);


    db.exec("DROP INDEX IF EXISTS ix_alert_matches_message_uid;");
    db.exec("DROP INDEX IF EXISTS ix_alert_matches_uid_term;");
    db.exec("ALTER TABLE alert_matches DROP COLUMN message_uid;");

    db.exec("DROP INDEX IF EXISTS ix_messages_uid;");
    db.exec("ALTER TABLE messages DROP COLUMN uid;");
  });

  migrate();

  logger.warn("✓ Migration 14 complete");
}
