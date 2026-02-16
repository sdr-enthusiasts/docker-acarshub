/**
 * Database migration runner for ACARS Hub
 *
 * This module handles database migrations with support for:
 * 1. Fresh databases (no tables) → Apply full Drizzle migration
 * 2. Alembic-managed databases → Check version and apply remaining migrations
 * 3. Legacy databases → Detect and upgrade appropriately
 *
 * Migration history (from Python Alembic):
 * 1. e7991f1644b1 - initial_schema
 * 2. 0fc8b7cae596 - split_signal_level_table
 * 3. a589d271a0a4 - split_freqs_table
 * 4. 94d97e655180 - create_messages_fts
 * 5. 3168c906fb9e - convert_icao_to_hex
 * 6. 204a67756b9a - add_message_uids
 * 7. 171fe2c07bd9 - create_alert_matches
 * 8. 40fd0618348d - final_v4_optimization (latest)
 *
 * Drizzle migration represents final state (migration #8).
 */

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("migrations");

const DB_PATH = process.env.ACARSHUB_DB || "./data/acarshub.db";
const LATEST_ALEMBIC_REVISION = "40fd0618348d";

interface AlembicVersion {
  versionNum: string | null;
}

/**
 * Check if database has alembic_version table
 */
function hasAlembicVersion(db: Database.Database): boolean {
  const result = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='alembic_version'",
    )
    .get();
  return result !== undefined;
}

/**
 * Get current Alembic version from database
 */
function getAlembicVersion(db: Database.Database): string | null {
  if (!hasAlembicVersion(db)) {
    return null;
  }

  const result = db.prepare("SELECT version_num FROM alembic_version").get() as
    | AlembicVersion
    | undefined;

  return result?.versionNum || null;
}

/**
 * Check if database has any tables (is initialized)
 */
function hasAnyTables(db: Database.Database): boolean {
  const result = db
    .prepare(
      "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    )
    .get() as { count: number };

  return result.count > 0;
}

/**
 * Check if database is at the latest schema version
 */
function isAtLatestVersion(db: Database.Database): boolean {
  // Check for alert_matches table (added in migration #7)
  const hasAlertMatches = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='alert_matches'",
    )
    .get();

  // Check for messages.uid column (added in migration #6)
  const columns = db.prepare("PRAGMA table_info(messages)").all() as Array<{
    name: string;
  }>;
  const hasUidColumn = columns.some((col) => col.name === "uid");

  return hasAlertMatches !== undefined && hasUidColumn;
}

/**
 * Run database migrations
 */
export function runMigrations(): void {
  logger.info("Starting database migrations", { dbPath: DB_PATH });

  const sqlite = new Database(DB_PATH);
  const db = drizzle(sqlite);

  try {
    // Case 1: Fresh database (no tables)
    if (!hasAnyTables(sqlite)) {
      logger.info("Fresh database detected, applying initial schema");
      migrate(db, { migrationsFolder: "./drizzle" });
      logger.info("Initial schema applied successfully");
      sqlite.close();
      return;
    }

    // Case 2: Check if already at latest version
    if (isAtLatestVersion(sqlite)) {
      const alembicVersion = getAlembicVersion(sqlite);
      if (alembicVersion === LATEST_ALEMBIC_REVISION) {
        logger.info("Database is at latest version (Alembic)", {
          version: LATEST_ALEMBIC_REVISION,
        });
      } else if (alembicVersion) {
        logger.warn(
          "Database schema is current but Alembic version is outdated",
          {
            current: alembicVersion,
            latest: LATEST_ALEMBIC_REVISION,
          },
        );
        // Update alembic version to latest
        sqlite
          .prepare("UPDATE alembic_version SET version_num = ?")
          .run(LATEST_ALEMBIC_REVISION);
        logger.info("Updated Alembic version marker");
      } else {
        logger.info(
          "Database is at latest schema version (no Alembic tracking)",
        );
      }
      sqlite.close();
      return;
    }

    // Case 3: Existing database with older schema
    const alembicVersion = getAlembicVersion(sqlite);

    if (alembicVersion) {
      logger.error(
        "Database has Alembic migrations but is not at latest version",
        {
          currentVersion: alembicVersion,
          latestVersion: LATEST_ALEMBIC_REVISION,
        },
      );
      logger.error(
        "Please run Python migration script first: python rootfs/scripts/upgrade_db.py",
      );
      logger.error(
        "Or use Alembic directly: cd rootfs/webapp && alembic upgrade head",
      );
      sqlite.close();
      process.exit(1);
    }

    // Case 4: Legacy database (no Alembic tracking)
    logger.error("Legacy database detected (no Alembic version tracking)");
    logger.error("This database must be upgraded using the Python script:");
    logger.error("  python rootfs/scripts/upgrade_db.py");
    logger.error("");
    logger.error("After upgrading, the Node.js backend can be used.");
    sqlite.close();
    process.exit(1);
  } catch (error) {
    logger.error("Migration failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    sqlite.close();
    throw error;
  }
}

// Run migrations if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations();
}
