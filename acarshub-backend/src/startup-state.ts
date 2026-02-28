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
 * Startup State
 *
 * Tracks whether database migrations are currently running and holds a queue
 * of Socket.IO clients that connected during the migration window.
 *
 * WHY THIS EXISTS
 * ---------------
 * Database migrations — especially the final VACUUM on a large install — can
 * block the Node.js event loop for minutes.  To give users immediate feedback
 * instead of a silent loading spinner, the HTTP and Socket.IO servers are
 * started BEFORE migrations run.  Clients that connect during that window
 * receive a `migration_status { running: true }` event and are held in the
 * pending queue.  Once all init is complete, `drainPendingSockets()` returns
 * the still-connected sockets so the caller can deliver the full connect
 * sequence to them.
 *
 * Clients that connect AFTER migrations finish (including those whose
 * connections timed out during the event-loop freeze and then reconnected)
 * receive the normal `handleConnect` sequence immediately — no special
 * handling required.
 */

import type { TypedSocket } from "./socket/types.js";
import { createLogger } from "./utils/logger.js";

const logger = createLogger("startup-state");

// ---------------------------------------------------------------------------
// Module-level state (singleton — one server process, one migration at a time)
// ---------------------------------------------------------------------------

let _migrationRunning = false;
const _pendingSockets: TypedSocket[] = [];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Mark the migration phase as started or finished.
 *
 * Call with `true` immediately before `runMigrations()` and with `false`
 * immediately after `initDatabase()` so that the DB is ready to serve
 * connections by the time any queued connection events fire.
 */
export function setMigrationRunning(running: boolean): void {
  _migrationRunning = running;
  if (running) {
    logger.info(
      "Migration phase started — new connections will receive migration_status event",
    );
  } else {
    logger.info(
      "Migration phase ended — new connections will receive normal connect sequence",
    );
  }
}

/**
 * Returns true while migrations (and the immediately-following DB init) are
 * still in progress.  The Socket.IO connection handler uses this to decide
 * whether to call `handleConnect` immediately or defer it.
 */
export function isMigrationRunning(): boolean {
  return _migrationRunning;
}

/**
 * Add a socket to the pending queue.
 *
 * The socket has already received `migration_status { running: true }`.  We
 * register a one-time `disconnect` listener to prune it from the queue
 * automatically if the client disconnects before migrations finish (e.g.
 * Socket.IO ping-timeout fires during a long VACUUM).
 */
export function registerPendingSocket(socket: TypedSocket): void {
  _pendingSockets.push(socket);

  // Auto-prune on early disconnect so drainPendingSockets() doesn't hand out
  // dead socket references to the caller.
  socket.once("disconnect", () => {
    const idx = _pendingSockets.indexOf(socket);
    if (idx !== -1) {
      _pendingSockets.splice(idx, 1);
      logger.debug(
        "Pending socket disconnected and removed from migration queue",
        {
          socketId: socket.id,
          remaining: _pendingSockets.length,
        },
      );
    }
  });

  logger.debug("Socket queued for post-migration connect sequence", {
    socketId: socket.id,
    queueDepth: _pendingSockets.length,
  });
}

/**
 * Remove and return all sockets that are still connected.
 *
 * Call this once after all startup init (migrations, DB open, background
 * services) is complete.  The caller is responsible for emitting
 * `migration_status { running: false }` and then calling `handleConnect` for
 * each returned socket.
 *
 * Sockets that disconnected during the migration freeze are silently dropped;
 * those clients will reconnect on their own and receive the normal connect
 * sequence.
 */
export function drainPendingSockets(): TypedSocket[] {
  const connected = _pendingSockets.filter((s) => s.connected);
  const dropped = _pendingSockets.length - connected.length;

  // Clear the backing array in-place so references held elsewhere see an
  // empty list (defensive — nothing outside this module should hold a ref).
  _pendingSockets.length = 0;

  if (dropped > 0) {
    logger.debug(
      "Discarded disconnected sockets from migration queue (timed out during migration)",
      { dropped },
    );
  }

  if (connected.length > 0) {
    logger.info(
      "Delivering deferred connect sequence to sockets that waited through migration",
      { count: connected.length },
    );
  }

  return connected;
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Reset all module-level state.  Only for use in tests — never call from
 * production code.
 */
export function resetStartupState(): void {
  _migrationRunning = false;
  _pendingSockets.length = 0;
}
