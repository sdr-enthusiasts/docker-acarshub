// ----------------------------------------------------------------------------
// GOD-02: extracted from db/migrate.ts.
// Migration 13: drop_unnecessary_indexes (96f36b89016d)
// ----------------------------------------------------------------------------

import type Database from "better-sqlite3";
import { createLogger } from "../../utils/logger.js";

const logger = createLogger("db:migrate-13");

export function migration13_dropUnnecessaryIndexes(
  db: Database.Database,
): void {
  logger.warn(
    "Applying migration 13: drop_unnecessary_indexes",
  );

  const migrate = db.transaction(() => {
    db.exec(`DROP INDEX IF EXISTS messages_uid_unique;`);
    db.exec(`DROP INDEX IF EXISTS ix_messages_msg_text;`);
    db.exec(`DROP INDEX IF EXISTS ix_messages_aircraft_id;`);
    db.exec(`DROP INDEX IF EXISTS ix_messages_time_icao;`);
    db.exec(`DROP INDEX IF EXISTS ix_messages_tail_flight;`);
    db.exec(`DROP INDEX IF EXISTS ix_messages_depa_dsta;`);
  });

  migrate();

  logger.warn("✓ Migration 13 complete");
}
