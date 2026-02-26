/**
 * Database client for ACARS Hub using Drizzle ORM + better-sqlite3
 *
 * This module provides:
 * - Database connection management
 * - Drizzle ORM client initialization
 * - Connection pooling (better-sqlite3 handles this internally)
 * - WAL mode for better concurrent read performance
 * - Proper cleanup on process exit
 *
 * Configuration:
 * - Database path from environment variable: ACARSHUB_DB
 * - Default: ./data/acarshub.db (relative to project root)
 * - WAL mode enabled for concurrent reads
 * - Timeout: 5000ms for busy database
 */

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { createLogger } from "../utils/logger.js";
import * as schema from "./schema.js";

const logger = createLogger("database");

// Environment configuration
const DB_PATH = process.env.ACARSHUB_DB || "./data/acarshub.db";
const DB_BACKUP_PATH = process.env.DB_BACKUP || "";
const DB_TIMEOUT = 5000; // 5 seconds

/**
 * SQLite database connection (primary)
 *
 * better-sqlite3 is synchronous and does not use connection pooling.
 * Multiple statement executions reuse the same connection.
 */
let sqliteConnection: Database.Database | null = null;

/**
 * SQLite database connection (backup)
 *
 * Optional secondary database for redundancy.
 * Enabled if DB_BACKUP environment variable is set.
 */
let sqliteBackupConnection: Database.Database | null = null;

/**
 * Drizzle ORM client instance (primary)
 *
 * Provides type-safe query builder and schema operations.
 */
let drizzleClient: ReturnType<typeof drizzle<typeof schema>> | null = null;

/**
 * Drizzle ORM client instance (backup)
 *
 * Optional backup database client.
 */
let drizzleBackupClient: ReturnType<typeof drizzle<typeof schema>> | null =
  null;

/**
 * Initialize database connection and Drizzle ORM client
 *
 * This function:
 * 1. Creates better-sqlite3 connection with WAL mode
 * 2. Sets pragmas for performance (WAL mode, synchronous=NORMAL)
 * 3. Initializes Drizzle ORM with schema
 * 4. Optionally initializes backup database if DB_BACKUP is set
 * 5. Registers cleanup handlers for graceful shutdown
 *
 * @param dbPath Optional database path (defaults to ACARSHUB_DB env var)
 * @returns Drizzle ORM client instance
 * @throws Error if database connection fails
 */
export function initDatabase(
  dbPath?: string,
): ReturnType<typeof drizzle<typeof schema>> {
  if (drizzleClient) {
    return drizzleClient;
  }

  try {
    const path = dbPath || DB_PATH;

    // Create SQLite connection
    sqliteConnection = new Database(path, {
      timeout: DB_TIMEOUT,
      verbose: process.env.NODE_ENV === "development" ? console.log : undefined,
    });

    // Enable WAL mode for better concurrent read performance
    // WAL mode allows readers to proceed without blocking writers
    //
    // IMPORTANT: journal_mode = WAL can silently fall back to DELETE mode on
    // file systems that do not support shared-memory (NFS, some bind-mounts,
    // read-only volumes).  We verify the return value and log an error so
    // operators know the WAL strategy is inactive before they see disk-full.
    //
    // In-memory databases always return "memory" — that is expected and not
    // an error.  Skip the check so test output stays clean.
    const actualMode = sqliteConnection.pragma("journal_mode = WAL", {
      simple: true,
    }) as string;
    const isMemory = path === ":memory:";
    if (!isMemory && actualMode !== "wal") {
      logger.error(
        "WAL journal mode could not be enabled — falling back to non-WAL mode. " +
          "Automatic WAL checkpointing will not work. " +
          "Check that the database volume supports shared-memory files (.db-shm).",
        { actualMode },
      );
    } else if (!isMemory) {
      logger.debug("WAL journal mode enabled");
    }

    // Set synchronous to NORMAL for better performance
    // NORMAL is safe with WAL mode (data integrity maintained)
    sqliteConnection.pragma("synchronous = NORMAL");

    // Enable foreign keys (SQLite default is OFF)
    sqliteConnection.pragma("foreign_keys = ON");

    // Set cache size to 10MB (negative = KB, positive = pages)
    sqliteConnection.pragma("cache_size = -10000");

    // Increase mmap_size for better performance (256MB)
    sqliteConnection.pragma("mmap_size = 268435456");

    // Lower auto-checkpoint threshold from the default 1000 pages (~4 MB) to
    // 200 pages (~800 KB). The scheduled TRUNCATE checkpoint runs every 5 minutes
    // but PASSIVE auto-checkpoint is the first line of defence between those
    // scheduled runs.  A 200-page threshold triggers auto-checkpoint roughly
    // every 800 KB of WAL writes, keeping the WAL file small on busy installs
    // (HFDL can sustain 1000+ msgs/min) even if a scheduled checkpoint is delayed.
    sqliteConnection.pragma("wal_autocheckpoint = 200");

    // Initialize Drizzle ORM
    drizzleClient = drizzle(sqliteConnection, { schema });

    // Initialize backup database if configured
    if (DB_BACKUP_PATH && !dbPath) {
      // Only init backup for primary database, not for test databases
      logger.info("Initializing backup database", { path: DB_BACKUP_PATH });
      try {
        sqliteBackupConnection = new Database(DB_BACKUP_PATH, {
          timeout: DB_TIMEOUT,
        });

        // Apply same pragmas to backup
        sqliteBackupConnection.pragma("journal_mode = WAL");
        sqliteBackupConnection.pragma("synchronous = NORMAL");
        sqliteBackupConnection.pragma("foreign_keys = ON");
        sqliteBackupConnection.pragma("cache_size = -10000");
        sqliteBackupConnection.pragma("mmap_size = 268435456");
        // Mirror the same 200-page auto-checkpoint threshold as the primary.
        sqliteBackupConnection.pragma("wal_autocheckpoint = 200");

        drizzleBackupClient = drizzle(sqliteBackupConnection, { schema });
        logger.info("Backup database initialized successfully");
      } catch (error) {
        logger.error("Failed to initialize backup database", {
          error: error instanceof Error ? error.message : String(error),
        });
        // Don't fail if backup init fails, just log it
      }
    }

    // Register cleanup handlers
    registerCleanupHandlers();

    return drizzleClient;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to initialize database: ${message}`);
  }
}

/**
 * Get the backup database client instance
 *
 * Returns the backup Drizzle client if configured, otherwise null.
 *
 * @returns Backup Drizzle client or null
 */
export function getBackupDatabase(): ReturnType<
  typeof drizzle<typeof schema>
> | null {
  return drizzleBackupClient;
}

/**
 * Check if backup database is enabled
 *
 * @returns true if backup database is configured and initialized
 */
export function hasBackupDatabase(): boolean {
  return drizzleBackupClient !== null;
}

/**
 * Get the current Drizzle client instance (primary)
 *
 * @returns Drizzle client or throws if not initialized
 * @throws Error if database not initialized
 */
export function getDatabase(): ReturnType<typeof drizzle<typeof schema>> {
  if (!drizzleClient) {
    throw new Error("Database not initialized. Call initDatabase() first.");
  }
  return drizzleClient;
}

/**
 * Get the raw SQLite connection
 *
 * Use this for operations that require direct SQLite access
 * (e.g., PRAGMA queries, VACUUM, ANALYZE)
 *
 * @returns SQLite connection or throws if not initialized
 * @throws Error if database not initialized
 */
export function getSqliteConnection(): Database.Database {
  if (!sqliteConnection) {
    throw new Error("Database not initialized. Call initDatabase() first.");
  }
  return sqliteConnection;
}

/**
 * Close database connection gracefully
 *
 * This function:
 * 1. Runs PRAGMA optimize to update query planner statistics
 * 2. Closes the SQLite connection (both primary and backup)
 * 3. Cleans up client references
 *
 * Safe to call multiple times (idempotent).
 */
export function closeDatabase(): void {
  // Close primary database
  if (sqliteConnection) {
    try {
      // Run PRAGMA optimize to update statistics before closing
      // This improves query planner performance on next startup
      sqliteConnection.pragma("optimize");
    } catch (error) {
      // Ignore errors during optimize (database might be locked)
      logger.warn("Error running PRAGMA optimize", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    try {
      sqliteConnection.close();
    } catch (error) {
      // Ignore errors during close (connection might already be closed)
      logger.warn("Error closing database", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    sqliteConnection = null;
    drizzleClient = null;
  }

  // Close backup database
  if (sqliteBackupConnection) {
    try {
      sqliteBackupConnection.pragma("optimize");
    } catch (error) {
      logger.warn("Error running PRAGMA optimize on backup", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    try {
      sqliteBackupConnection.close();
    } catch (error) {
      logger.warn("Error closing backup database", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    sqliteBackupConnection = null;
    drizzleBackupClient = null;
  }
}

/**
 * Check if database connection is active
 *
 * @returns true if database is initialized and connection is open
 */
export function isDatabaseOpen(): boolean {
  return sqliteConnection?.open === true;
}

/**
 * Execute a database checkpoint (WAL mode)
 *
 * This forces WAL data to be written to the main database file.
 * Useful for:
 * - Periodic checkpointing during idle periods
 * - Before backups
 * - Before shutdown
 *
 * @param mode Checkpoint mode: PASSIVE, FULL, RESTART, TRUNCATE
 * @returns Number of frames checkpointed and number remaining in WAL
 */
export function checkpoint(
  mode: "PASSIVE" | "FULL" | "RESTART" | "TRUNCATE" = "PASSIVE",
): { framesCheckpointed: number; framesRemaining: number } {
  const conn = getSqliteConnection();

  // Run PRAGMA wal_checkpoint with specified mode.
  // Returns a single row with three columns:
  //   busy        - 1 if writers blocked the checkpoint, else 0
  //   log         - total frames currently in the WAL file
  //   checkpointed - frames successfully moved to the main DB file
  //
  // NOTE: { simple: true } would return only the first column (busy) as a
  // scalar, so we use the default array-of-objects form and access by name.
  const result = conn.pragma(`wal_checkpoint(${mode})`) as {
    busy: number;
    log: number;
    checkpointed: number;
  }[];

  const row = result[0];
  return {
    framesCheckpointed: row.checkpointed,
    // frames written to WAL but not yet moved to the main DB file
    framesRemaining: row.log - row.checkpointed,
  };
}

/**
 * Execute a WAL checkpoint on the backup database (if configured)
 *
 * The scheduled checkpoint task only called checkpoint() which uses
 * getSqliteConnection() — the primary connection.  The backup connection
 * (sqliteBackupConnection) was never explicitly checkpointed, leaving it to
 * rely solely on PASSIVE auto-checkpoint.  When auto-checkpoint stalls (e.g.
 * on a busy install) the backup WAL grew without bound.
 *
 * @param mode Checkpoint mode: PASSIVE, FULL, RESTART, TRUNCATE
 * @returns Checkpoint result, or null if no backup database is configured
 */
export function checkpointBackup(
  mode: "PASSIVE" | "FULL" | "RESTART" | "TRUNCATE" = "PASSIVE",
): { framesCheckpointed: number; framesRemaining: number } | null {
  if (!sqliteBackupConnection) {
    return null;
  }

  const result = sqliteBackupConnection.pragma(
    `wal_checkpoint(${mode})`,
  ) as {
    busy: number;
    log: number;
    checkpointed: number;
  }[];

  const row = result[0];
  return {
    framesCheckpointed: row.checkpointed,
    framesRemaining: row.log - row.checkpointed,
  };
}

/**
 * Optimize database (vacuum, analyze)
 *
 * This performs maintenance operations:
 * - PRAGMA optimize: Updates query planner statistics
 * - VACUUM: Rebuilds database file to reclaim space (optional, slow)
 * - ANALYZE: Updates index statistics
 *
 * @param fullVacuum If true, run VACUUM (slow, blocks all access)
 */
export function optimizeDatabase(fullVacuum = false): void {
  const conn = getSqliteConnection();

  // Always run optimize (fast, updates statistics)
  conn.pragma("optimize");

  // Always run analyze (updates index statistics)
  conn.exec("ANALYZE");

  // Optionally run vacuum (slow, rebuilds database)
  if (fullVacuum) {
    conn.exec("VACUUM");
  }
}

/**
 * Register cleanup handlers for graceful shutdown
 *
 * Ensures database is properly closed when process exits.
 */
function registerCleanupHandlers(): void {
  // SIGINT (Ctrl+C)
  process.on("SIGINT", () => {
    logger.info("Received SIGINT, closing database...");
    closeDatabase();
    process.exit(0);
  });

  // SIGTERM (Docker stop, systemd stop)
  process.on("SIGTERM", () => {
    logger.info("Received SIGTERM, closing database...");
    closeDatabase();
    process.exit(0);
  });

  // Uncaught exceptions (last resort)
  process.on("uncaughtException", (error) => {
    logger.fatal("Uncaught exception", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    closeDatabase();
    process.exit(1);
  });

  // Unhandled promise rejections
  process.on("unhandledRejection", (reason, promise) => {
    logger.fatal("Unhandled rejection", {
      reason: reason instanceof Error ? reason.message : String(reason),
      promise: String(promise),
    });
    closeDatabase();
    process.exit(1);
  });

  // Normal process exit
  process.on("exit", () => {
    closeDatabase();
  });
}

/**
 * Health check: Verify database is accessible
 *
 * @returns true if database is healthy
 */
export function healthCheck(): boolean {
  try {
    const conn = getSqliteConnection();
    // Simple query to verify database is accessible
    const result = conn.prepare("SELECT 1 as health").get() as
      | { health: number }
      | undefined;
    return result?.health === 1;
  } catch {
    return false;
  }
}
