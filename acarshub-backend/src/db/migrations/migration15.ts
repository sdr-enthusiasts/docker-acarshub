// ----------------------------------------------------------------------------
// GOD-02: extracted from db/migrate.ts.
// Migration 15: drop_unnecessary_indexes2 (8c9d47f5ed13)
// ----------------------------------------------------------------------------

import type Database from "better-sqlite3";
import { createLogger } from "../../utils/logger.js";

const logger = createLogger("db:migrate-15");

export function migration15_dropUnnecessaryIndexes2(
  db: Database.Database,
): void {
  logger.warn(
    "Applying migration 15: drop_unnecessary_indexes2",
  );

  const migrate = db.transaction(() => {
    db.exec(`DROP INDEX IF EXISTS ix_messages_dsta;`);
    db.exec(`DROP INDEX IF EXISTS ix_messages_depa;`);
    db.exec(`DROP INDEX IF EXISTS ix_messages_tail;`);
    db.exec(`DROP INDEX IF EXISTS ix_messages_flight;`);
    db.exec(`DROP INDEX IF EXISTS ix_messages_label;`);
    db.exec(`DROP INDEX IF EXISTS ix_messages_freq;`);
  });

  migrate();

  logger.warn("✓ Migration 15 complete");
}
