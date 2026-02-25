// Copyright (C) 2022-2026 Frederick Clausen II
// This file is part of acarshub <https://github.com/sdr-enthusiasts/docker-acarshub>.
//
// acarshub is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// acarshub is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with acarshub.  If not, see <http://www.gnu.org/licenses/>.

/**
 * Station ID Registry
 *
 * Maintains a warm in-memory set of every unique station_id seen across all
 * message types.  The registry is populated at startup from the database so
 * that already-known IDs survive server restarts, and is updated in real-time
 * as new messages arrive.
 *
 * Why in-memory rather than querying the DB each time?
 * - Avoids a synchronous DB round-trip on the hot message path.
 * - Set.has() is O(1); a SELECT DISTINCT query would be O(n) per message.
 * - The set is small (stations rarely exceed a few dozen entries).
 *
 * Broadcast contract:
 * - On client connect  → send current sorted list via socket.emit("station_ids")
 * - On new station seen → broadcast updated sorted list via namespace.emit("station_ids")
 */

import { getDatabase } from "../db/client.js";
import { messages } from "../db/schema.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("services:station-ids");

/** Warm in-memory set of every known station_id. */
const knownStationIds = new Set<string>();

/**
 * Populate the registry from the database.
 *
 * Should be called once at startup after `initDatabase()` completes.
 * Safe to call multiple times – subsequent calls are no-ops (warn + return).
 */
export function initializeStationIds(): void {
  const db = getDatabase();

  try {
    const rows = db
      .selectDistinct({ stationId: messages.stationId })
      .from(messages)
      .all();

    let loaded = 0;
    for (const row of rows) {
      const id = row.stationId?.trim();
      if (id) {
        knownStationIds.add(id);
        loaded++;
      }
    }

    logger.info("Station ID registry initialised from database", {
      count: loaded,
    });
  } catch (error) {
    logger.error("Failed to initialise station ID registry from database", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Return the current list of known station IDs in sorted order.
 *
 * Returns a new array on every call so callers cannot mutate the registry.
 */
export function getStationIds(): string[] {
  return Array.from(knownStationIds).sort();
}

/**
 * Check whether `stationId` is already known; if not, add it to the registry.
 *
 * @returns `true` if this was a **new** station ID (caller should broadcast),
 *          `false` if it was already known.
 */
export function checkAndAddStationId(stationId: string | undefined): boolean {
  const id = stationId?.trim();
  if (!id) return false;
  if (knownStationIds.has(id)) return false;

  knownStationIds.add(id);
  logger.info("New station ID added to registry", {
    stationId: id,
    totalKnown: knownStationIds.size,
  });
  return true;
}

/**
 * Reset the registry (for use in tests only).
 * @internal
 */
export function resetStationIdsForTesting(): void {
  knownStationIds.clear();
}
