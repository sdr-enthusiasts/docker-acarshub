// ----------------------------------------------------------------------------
// Migration 16: rebuild_level_imsl (e4ff51950274)
//
// Stored IMSL messages carry message_type "IMS-L" (the legacy Python name),
// but until the shared decoderKeyFromMessageType helper was adopted the live
// insert path's level-table map only knew "IMSL", so live IMSL traffic never
// updated level_imsl. Migration 2 had the same alias gap when it first built
// the per-decoder level tables. level_imsl therefore holds nothing useful;
// the stored messages are the best available source, so this migration
// replaces its contents with counts rebuilt from them, using the exact same
// aggregation as migration 2. Idempotent: it clears the table first. Skips
// if level_imsl or messages is absent (partial-schema fixtures).
// ----------------------------------------------------------------------------

import type Database from "better-sqlite3";
import { createLogger } from "../../utils/logger.js";
import { rebuildLevelTableFromMessages } from "./migration02.js";

const logger = createLogger("db:migrate-16");

export function migration16_rebuildLevelImsl(db: Database.Database): void {
  logger.warn("Applying migration 16: rebuild_level_imsl");

  const presentTables = db
    .prepare(
      "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name IN ('level_imsl', 'messages')",
    )
    .get() as { n: number };

  if (presentTables.n < 2) {
    logger.warn("level_imsl or messages table missing, skipping");
    return;
  }

  const migrate = db.transaction(() => {
    db.exec("DELETE FROM level_imsl");
    rebuildLevelTableFromMessages(db, "level_imsl", "imsl");
  });

  migrate();

  logger.warn("✓ Migration 16 complete");
}
