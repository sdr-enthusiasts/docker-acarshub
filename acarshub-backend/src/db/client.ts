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
const DB_TIMEOUT = 5000; // 5 seconds

/**
 * SQLite database connection
 *
 * better-sqlite3 is synchronous and does not use connection pooling.
 * Multiple statement executions reuse the same connection.
 */
let sqliteConnection: Database.Database | null = null;

/**
 * Drizzle ORM client instance
 *
 * Provides type-safe query builder and schema operations.
 */
let drizzleClient: ReturnType<typeof drizzle<typeof schema>> | null = null;

/**
 * Initialize database connection and Drizzle ORM client
 *
 * This function:
 * 1. Creates better-sqlite3 connection with WAL mode
 * 2. Sets pragmas for performance (WAL mode, synchronous=NORMAL)
 * 3. Initializes Drizzle ORM with schema
 * 4. Registers cleanup handlers for graceful shutdown
 *
 * @returns Drizzle ORM client instance
 * @throws Error if database connection fails
 */
export function initDatabase(): ReturnType<typeof drizzle<typeof schema>> {
  if (drizzleClient) {
    return drizzleClient;
  }

  try {
    // Create SQLite connection
    sqliteConnection = new Database(DB_PATH, {
      timeout: DB_TIMEOUT,
      verbose: process.env.NODE_ENV === "development" ? console.log : undefined,
    });

    // Enable WAL mode for better concurrent read performance
    // WAL mode allows readers to proceed without blocking writers
    sqliteConnection.pragma("journal_mode = WAL");

    // Set synchronous to NORMAL for better performance
    // NORMAL is safe with WAL mode (data integrity maintained)
    sqliteConnection.pragma("synchronous = NORMAL");

    // Enable foreign keys (SQLite default is OFF)
    sqliteConnection.pragma("foreign_keys = ON");

    // Set cache size to 10MB (negative = KB, positive = pages)
    sqliteConnection.pragma("cache_size = -10000");

    // Increase mmap_size for better performance (256MB)
    sqliteConnection.pragma("mmap_size = 268435456");

    // Initialize Drizzle ORM
    drizzleClient = drizzle(sqliteConnection, { schema });

    // Register cleanup handlers
    registerCleanupHandlers();

    return drizzleClient;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to initialize database: ${message}`);
  }
}

/**
 * Get the current Drizzle client instance
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
 * 2. Closes the SQLite connection
 * 3. Cleans up client references
 *
 * Safe to call multiple times (idempotent).
 */
export function closeDatabase(): void {
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

  // Run PRAGMA wal_checkpoint with specified mode
  const result = conn.pragma(`wal_checkpoint(${mode})`, { simple: true }) as [
    number,
    number,
    number,
  ];

  return {
    framesCheckpointed: result[1],
    framesRemaining: result[2],
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
