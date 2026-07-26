/**
 * Database migration runner for ACARS Hub
 *
 * This handles migrating databases from ANY Alembic migration point to the latest schema.
 * It detects the current Alembic version and applies necessary upgrades.
 *
 * GOD-02: this file used to contain all 15 migration step implementations
 * plus the FTS-integrity and state-detection helpers inline (1688 lines). It
 * is now the orchestrator only — the migration chain itself, the per-migration
 * upgrade functions, the FTS schema helpers, and the state-detection helpers
 * all live in db/migrations/ (see that directory's index.ts for the full
 * migration-chain listing and rationale for the module boundaries).
 *
 * This file keeps:
 * - runMigrationsInWorker() — spawns the migration work in a child process so
 *   the main event loop stays free (see its own docstring for why).
 * - runMigrations() — the actual orchestrator: detects current DB state,
 *   walks MIGRATIONS from the right starting point, runs the unconditional
 *   FTS integrity check, and VACUUMs/ANALYZEs once at the end if any work
 *   was done.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { createLogger } from "../utils/logger.js";
import {
  getAlembicVersion,
  hasAnyTables,
  isAtInitialMigrationState,
  LATEST_REVISION,
  MIGRATIONS,
  setAlembicVersion,
  verifyAndRepairFtsIfNeeded,
} from "./migrations/index.js";

const logger = createLogger("db:migrate");
const DB_PATH = process.env.ACARSHUB_DB || "./data/acarshub.db";

/**
 * Run database migrations in a child process so the main event loop stays free.
 *
 * WHY A CHILD PROCESS
 * -------------------
 * better-sqlite3 is entirely synchronous.  On large databases, the final
 * VACUUM can block a thread for 10–30+ minutes.  Running that work on the
 * main Node.js thread freezes the event loop, which means:
 *   - HTTP polling responses cannot be sent
 *   - WebSocket upgrade handshakes time out and never complete
 *   - Socket.IO cannot deliver `migration_status { running: true }` to clients
 *
 * Spawning a child process keeps the main event loop completely free
 * throughout the migration window.  Socket.IO can upgrade connections to
 * WebSocket and actually deliver the migration banner to the browser.
 *
 * DEV vs PRODUCTION
 * -----------------
 * process.execArgv already contains the tsx loader flags when running under
 * `tsx watch` (--require preflight.cjs --import tsx/loader.mjs).  We pass
 * those directly to the child so it inherits the TypeScript runtime in dev
 * mode.  In production (compiled JS) execArgv is empty or contains only
 * node flags — the child loads the compiled .js worker normally.
 *
 * The worker script (migrate-worker.ts/.js) receives the dbPath as argv[2]
 * and communicates success/failure via exit code (0 / non-zero).
 *
 * SAFETY PROTOCOL
 * ---------------
 * 1. Child: open DB → run migrations (inc. VACUUM) → close DB → exit 0
 * 2. Main: receive exit-0 → open its own DB connection via initDatabase()
 * Steps 1 and 2 are strictly sequential, never concurrent.
 *
 * @param dbPath Path to the SQLite database file.
 * @returns Promise that resolves when migrations complete successfully.
 * @throws Error if migrations fail or the child exits abnormally.
 */
export function runMigrationsInWorker(dbPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Diagnostic: log the bundle URL so Docker logs confirm which code path
    // is active.  This is the single most useful data point when debugging
    // "banner not showing in Docker" reports.
    const bundleUrl = import.meta.url;
    logger.debug("runMigrationsInWorker called", { bundleUrl, dbPath });

    // Select the worker script: .ts in dev (tsx watch), .mjs in production.
    //
    // import.meta.url ends with ".ts"  → we are running TypeScript source
    //   (dev: tsx watch / tsx node).
    // import.meta.url ends with ".mjs" → we are running the esbuild bundle
    //   (production Docker: node server.bundle.mjs).
    const isDev = bundleUrl.endsWith(".ts");

    // Only use the .ts spawn path when a tsx loader is actually present in
    // process.execArgv.  Under `tsx watch` it contains
    //   --import file:///…/tsx/dist/loader.mjs
    // which lets the child process load TypeScript.  In test runners (vitest)
    // TypeScript is handled differently and execArgv has no tsx loader, so
    // we fall back to the synchronous path to keep tests simple.
    const hasTsxLoader = process.execArgv.some((arg) =>
      arg.includes("/tsx/"),
    );

    logger.debug("Migration path decision", {
      isDev,
      hasTsxLoader,
      execArgv: process.execArgv,
      execPath: process.execPath,
      willSpawn: !(isDev && !hasTsxLoader),
    });

    if (isDev && !hasTsxLoader) {
      logger.debug(
        "No tsx loader in execArgv — running migrations synchronously " +
          "(test environment or non-tsx dev runner)",
      );
      try {
        runMigrations(dbPath);
        resolve();
      } catch (error) {
        reject(error);
      }
      return;
    }

    // Production: .mjs because the worker is compiled as a separate ESM bundle
    // (migrate-worker.mjs) by esbuild alongside server.bundle.mjs.  Using .mjs
    // is unambiguous — Node loads it as ESM regardless of any package.json
    // "type" field.  Dev: .ts loaded via the tsx loader already in execArgv.
    const ext = isDev ? ".ts" : ".mjs";
    const workerPath = fileURLToPath(
      new URL(`./migrate-worker${ext}`, import.meta.url),
    );

    logger.debug("Migration worker path resolved", {
      workerPath,
      ext,
      isDev,
    });

    // Verify the worker file exists before spawning so the error message is
    // actionable.  A missing worker file (e.g. stale Docker image built before
    // the worker bundle step was added to the Dockerfile) would otherwise
    // produce a cryptic ENOENT from spawn() with no context.
    if (!existsSync(workerPath)) {
      // Worker file is missing.  Fall back to synchronous migration on the
      // main thread with a prominent warning.  The event loop will block
      // during heavy operations (VACUUM) and the migration banner will not
      // show in the browser, but the server will still come up correctly
      // instead of crash-looping.
      //
      // HOW TO FIX: rebuild the Docker image so the Dockerfile esbuild step
      // that produces migrate-worker.mjs is included.  See Dockerfile stage 1.
      logger.warn(
        "⚠️  migrate-worker file not found — falling back to SYNCHRONOUS " +
          "migrations on the main thread.  The event loop will be blocked " +
          "during VACUUM and the migration banner will NOT appear in the " +
          "browser.  Rebuild the Docker image to restore the child-process " +
          "worker and the migration banner.",
        { workerPath, bundleUrl },
      );
      try {
        runMigrations(dbPath);
        resolve();
      } catch (error) {
        reject(error);
      }
      return;
    }

    // process.execArgv carries tsx loader flags in dev mode so the child can
    // load TypeScript.  In production it is empty (or just node flags like
    // --max-old-space-size) which is fine for compiled JS.
    const child = spawn(
      process.execPath,
      [...process.execArgv, workerPath, dbPath],
      { stdio: "inherit", env: process.env },
    );

    logger.debug("Migration child process started", {
      workerPath,
      dbPath,
      isDev,
      pid: child.pid,
    });

    child.on("error", (err) => {
      // spawn() itself failed (e.g. EACCES, ENOENT after the existsSync check
      // somehow raced, or a seccomp/AppArmor restriction on fork/exec).
      // Fall back to synchronous migration so the server comes up instead of
      // crash-looping, but make the situation unmissable in the logs.
      logger.warn(
        "⚠️  Migration child process failed to spawn — falling back to " +
          "SYNCHRONOUS migrations on the main thread.  The event loop will " +
          "be blocked during VACUUM and the migration banner will NOT appear.",
        { error: err.message, workerPath },
      );
      try {
        runMigrations(dbPath);
        resolve();
      } catch (migErr) {
        reject(migErr);
      }
    });

    child.on("close", (code) => {
      if (code === 0) {
        logger.info("Migration child process completed successfully");
        resolve();
      } else {
        const msg = `Migration process exited with code ${code}`;
        logger.error(msg, { workerPath, dbPath });
        reject(new Error(msg));
      }
    });
  });
}

export function runMigrations(dbPath?: string): void {
  const actualDbPath = dbPath || DB_PATH;
  logger.info("Starting database migrations", { dbPath: actualDbPath });

  const db = new Database(actualDbPath);

  try {
    const currentVersion = getAlembicVersion(db);
    logger.info("Current database version", {
      version: currentVersion || "none",
    });

    let startIndex = 0;
    if (currentVersion) {
      // Database has alembic_version table - find where to start
      startIndex = MIGRATIONS.findIndex((m) => m.revision === currentVersion);
      if (startIndex === -1) {
        throw new Error(`Unknown Alembic version: ${currentVersion}`);
      }
      startIndex++; // Start from next migration
    } else if (!hasAnyTables(db)) {
      // Fresh database - start from beginning
      logger.warn("Fresh database detected - will apply all migrations");
      startIndex = 0;
    } else if (isAtInitialMigrationState(db)) {
      // Database matches initial Alembic migration state (e7991f1644b1)
      // Skip migration 1 and start from migration 2
      logger.warn(
        "Database matches initial Alembic migration state (e7991f1644b1) - starting from migration 2",
      );
      startIndex = 1;
      // Set alembic version to initial state
      const initialMigration = MIGRATIONS[0];
      if (!initialMigration) {
        throw new Error("No migrations defined");
      }
      setAlembicVersion(db, initialMigration.revision);
    } else {
      throw new Error(
        "Database has tables but structure doesn't match any known migration state. " +
          "Cannot migrate safely. Please check database integrity.",
      );
    }

    for (let i = startIndex; i < MIGRATIONS.length; i++) {
      const migration = MIGRATIONS[i];
      if (!migration) {
        throw new Error(`Migration at index ${i} is undefined`);
      }
      logger.warn(`Applying migration ${i + 1}/${MIGRATIONS.length}`, {
        revision: migration.revision,
        name: migration.name,
      });

      migration.upgrade(db);
      setAlembicVersion(db, migration.revision);
    }

    const migrationsRan = startIndex < MIGRATIONS.length;

    if (!migrationsRan) {
      logger.info("Database is already at latest version", {
        version: LATEST_REVISION,
      });
    } else {
      logger.warn("All migrations applied successfully", {
        version: LATEST_REVISION,
      });
    }

    // Always run the FTS integrity check, regardless of whether any migration
    // was applied.  This catches databases that are already at the latest
    // version but still carry the stale 8-column FTS from the pre-Alembic era.
    const ftsRepaired = verifyAndRepairFtsIfNeeded(db);

    // VACUUM and ANALYZE run at most once per startup, only when work was
    // actually done.  Running them inside individual migration functions caused
    // redundant multi-hour stalls on large databases when several migrations
    // ran in sequence.  ANALYZE runs after VACUUM so the query planner sees
    // the final, compacted page layout and all indexes created by every
    // migration step.
    if (migrationsRan || ftsRepaired) {
      logger.warn(
        "Running VACUUM to reclaim disk space freed by migrations — " +
          "this may take several minutes on large databases and requires free " +
          "disk space roughly equal to the current database file size...",
      );
      db.exec("VACUUM");
      logger.warn("✓ VACUUM complete");

      logger.warn("Running ANALYZE to update query planner statistics...");
      db.exec("ANALYZE");
      logger.warn("✓ ANALYZE complete");
    }

    db.close();
  } catch (error) {
    logger.error("Migration failed", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    db.close();
    throw error;
  }
}
