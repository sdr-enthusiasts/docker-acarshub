// ----------------------------------------------------------------------------
// GOD-02: extracted from db/migrate.ts.
//
// Migration 10: Rebuild FTS5 from scratch to clear tombstone accumulation
// (c3d4e5f6a1b2)
//
// WHY THIS EXISTS
// ---------------
// FTS5 delete/update triggers write tombstone entries into messages_fts_data
// on every pruned row.  The scheduled merge task was using merge(-16) which
// wrote only ~64 KB per call — completely unable to keep pace with the
// tombstone accumulation on high-volume installs (HFDL + VDL-M2).  At
// ~536,000 segments and 2.6 GB of shadow-table data, every INSERT caused
// FTS5 automerge to block the synchronous better-sqlite3 thread for seconds,
// stalling message ingestion entirely.
//
// This migration drops all FTS tables and triggers and recreates them cleanly,
// then rebuilds the index from the messages table.  Disk space is reclaimed by
// the single VACUUM that runs at the end of runMigrations() when any migration
// step executes.
//
// Both steps can take several minutes on a large database — this is a
// one-time startup cost.
// ----------------------------------------------------------------------------

import type Database from "better-sqlite3";
import { createLogger } from "../../utils/logger.js";
import { createFtsTableAndTriggers, dropFtsTableAndTriggers } from "./fts-helpers.js";

const logger = createLogger("db:migrate-10");

export function migration10_rebuildFts(db: Database.Database): void {
  logger.warn("Applying migration 10: rebuild_fts");

  logger.warn(
    "Dropping FTS table and triggers to clear tombstone accumulation...",
  );
  dropFtsTableAndTriggers(db);
  logger.warn("✓ FTS table and triggers dropped");

  logger.warn(
    "Recreating FTS table and triggers from scratch...",
  );
  createFtsTableAndTriggers(db);
  logger.warn("✓ FTS table and triggers recreated");

  logger.warn("✓ Migration 10 finished");
}
