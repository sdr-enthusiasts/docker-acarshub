// Copyright (C) 2022-2026 Frederick Clausen II
// This file is part of acarshub <https://github.com/sdr-enthusiasts/docker-acarshub>.

// acarshub is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// acarshub is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with acarshub.  If not, see <http://www.gnu.org/licenses/>.

/**
 * Migration Worker / Child-Process Script
 *
 * This module is invoked in one of two ways:
 *
 *   1. As a child process (preferred):
 *        node [...execArgv] migrate-worker.mjs <dbPath>
 *      dbPath comes from process.argv[2].
 *      Success/failure is communicated via exit code (0 / 1).
 *
 *   2. As a worker_threads Worker (legacy path, kept for compat):
 *        new Worker('./migrate-worker.js', { workerData: { dbPath } })
 *      dbPath comes from workerData.
 *      Success/failure is also communicated via parentPort.postMessage
 *      and exit code.
 *
 * WHY A SEPARATE PROCESS
 * ----------------------
 * better-sqlite3 is entirely synchronous. On large databases VACUUM can
 * block a thread for 10-30+ minutes. Running that on the main Node.js
 * thread freezes the event loop — HTTP polling responses stop, WebSocket
 * upgrade handshakes time out, and Socket.IO can never deliver the
 * migration_status banner to the browser.
 *
 * Running migrations in a child process keeps the main event loop
 * completely free throughout the migration window.
 *
 * THREAD-SAFETY NOTE
 * ------------------
 * The protocol enforced by the caller (runMigrationsInWorker in migrate.ts):
 *   1. This process opens the DB, runs migrations, closes the DB, exits.
 *   2. Main process receives exit-0, then opens its own connection via
 *      initDatabase().
 * Steps 1 and 2 are sequential — never concurrent — so SQLite file
 * locking is safe.
 *
 * DEBUG / TESTING
 * ---------------
 * Set ACARSHUB_SIMULATE_MIGRATION_DELAY_MS to a positive integer (e.g. 30000
 * for 30 seconds) to make the worker sleep after migrations complete.  This
 * keeps the main process in the "migration running" state long enough for a
 * browser to connect and see the migration banner without needing a real
 * large-database VACUUM.
 *
 * Example (Docker Compose):
 *   environment:
 *     ACARSHUB_SIMULATE_MIGRATION_DELAY_MS: "30000"
 *
 * NEVER set this in production — it delays every startup by the given amount.
 */

import { parentPort, workerData } from "node:worker_threads";
import { createLogger } from "../utils/logger.js";
import { runMigrations } from "./migrate.js";

const logger = createLogger("migrate-worker");

// ---------------------------------------------------------------------------
// Debug simulation delay
//
// ACARSHUB_SIMULATE_MIGRATION_DELAY_MS lets developers verify the migration
// banner without needing a real large-database VACUUM.  When set, the worker
// sleeps for the specified number of milliseconds after migrations complete,
// keeping the main process in the "migration running" state for that window.
//
// This is intentionally implemented as a synchronous spin-wait (Atomics.wait)
// rather than a Promise/setTimeout because the worker is a plain script, not
// an async function, and we need the process to actually block (simulating
// the same kind of blocking behaviour that a real VACUUM produces).
// ---------------------------------------------------------------------------

function simulationDelayMs(): number {
  const raw = process.env.ACARSHUB_SIMULATE_MIGRATION_DELAY_MS;
  if (!raw) return 0;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function sleepSync(ms: number): void {
  // Atomics.wait on a fresh SharedArrayBuffer is the standard way to do a
  // synchronous sleep in Node.js without busy-looping.  It blocks the thread
  // for exactly `ms` milliseconds (the wait always times out because nothing
  // ever notifies the index).
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MigrateWorkerData {
  dbPath: string;
}

export interface MigrateWorkerResult {
  success: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Resolve dbPath
//
// When spawned as a child process, workerData is null and the db path is
// passed as the first positional argument (process.argv[2]).
// When used as a worker thread, workerData.dbPath is set by the caller.
// ---------------------------------------------------------------------------

const typedWorkerData = workerData as MigrateWorkerData | null;
const dbPath: string | undefined =
  typedWorkerData?.dbPath ?? process.argv[2];

if (!dbPath) {
  const msg = "migrate-worker: no dbPath provided (expected workerData.dbPath or argv[2])";
  parentPort?.postMessage({ success: false, error: msg } satisfies MigrateWorkerResult);
  process.stderr.write(`${msg}\n`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

try {
  runMigrations(dbPath);

  // Debug hook: hold the worker open for a configurable delay so developers
  // can verify the migration banner in Docker without needing a real migration.
  // Has no effect unless ACARSHUB_SIMULATE_MIGRATION_DELAY_MS is set.
  const delay = simulationDelayMs();
  if (delay > 0) {
    logger.warn(
      "ACARSHUB_SIMULATE_MIGRATION_DELAY_MS is set — sleeping to simulate a long migration (dev/test only)",
      { delayMs: delay },
    );
    sleepSync(delay);
    logger.info("Simulation delay complete");
  }

  parentPort?.postMessage({ success: true } satisfies MigrateWorkerResult);
  // Child-process path: normal exit (code 0).
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  parentPort?.postMessage({
    success: false,
    error: message,
  } satisfies MigrateWorkerResult);
  process.exit(1);
}
