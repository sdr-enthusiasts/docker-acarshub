// ----------------------------------------------------------------------------
// GOD-02: extracted from db/migrate.ts.
// Migration 1: Initial Schema (e7991f1644b1)
// ----------------------------------------------------------------------------

import type Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate as drizzleMigrate } from "drizzle-orm/better-sqlite3/migrator";
import { createLogger } from "../../utils/logger.js";

const logger = createLogger("db:migrate-01");

export function migration01_initialSchema(db: Database.Database): void {
  logger.warn("Applying migration 1: initial_schema");

  const hasMessages = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='messages'",
    )
    .get();

  if (hasMessages) {
    logger.warn("Messages table already exists, skipping initial schema");
    return;
  }

  // Apply full initial schema from Drizzle
  const drizzleDb = drizzle(db);
  drizzleMigrate(drizzleDb, { migrationsFolder: "./drizzle" });
}
