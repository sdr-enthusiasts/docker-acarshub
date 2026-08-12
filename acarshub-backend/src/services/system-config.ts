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
 * System Config Service
 *
 * Typed read/write access to the `system_config` key-value table (created by
 * migration16.ts, backed by the `systemConfig` Drizzle table in schema.ts).
 *
 * Why no cache?
 * - Reads are rare: a startup version check (`acars_decoder_installed_version`)
 *   and occasional status polls. Writes are rare too: at most one per
 *   search-index rebuild batch. Neither is on a hot path.
 * - A cache here would only add an invalidation bug (stale value read after
 *   a write from another process/connection) for no measured performance
 *   gain. Reading straight through to SQLite is cheap enough at this call
 *   frequency.
 *
 * Why module functions instead of the singleton factory pattern (Architecture
 * Invariant 12) used elsewhere in this codebase?
 * - This service holds no state of its own: no timers, no sockets, no
 *   in-memory cache. Every call obtains the database handle fresh via
 *   `getDatabase()`. A factory exists to manage lifecycle for something
 *   stateful; wrapping a stateless pair of functions in one would create a
 *   singleton that wraps nothing.
 */

import { eq } from "drizzle-orm";
import { getDatabase } from "../db/client.js";
import { systemConfig } from "../db/schema.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("services:system-config");

/**
 * Keys recognised in the v4.3 `system_config` table.
 *
 * `search_index_rebuild_status` and `search_index_rebuild_cursor` are
 * consumed by Phase 4 (the search-index rebuild service, which replaced the
 * originally-planned decoder reprocessor once Open Question 7 was answered).
 *
 * This is a closed union rather than a bare `string` so that a mistyped key
 * is a compile error instead of a silent `null` at runtime — a silent null
 * read of the rebuild cursor would look like "no cursor yet" and restart the
 * rebuild from zero instead of resuming it.
 */
export type SystemConfigKey =
  | "acars_decoder_installed_version"
  | "search_index_rebuild_status"
  | "search_index_rebuild_cursor";

/**
 * Read the current value for `key`.
 *
 * @returns The stored value, or `null` if the key has never been set. Never
 *          throws for a missing key.
 */
export function getSystemConfigValue(key: SystemConfigKey): string | null {
  const db = getDatabase();
  const row = db
    .select({ value: systemConfig.value })
    .from(systemConfig)
    .where(eq(systemConfig.key, key))
    .get();

  logger.debug("Read system config value", {
    key,
    found: row !== undefined,
    valueLength: row?.value.length,
  });

  return row ? row.value : null;
}

/**
 * Set (insert or overwrite) the value for `key`.
 *
 * Implemented as a single-statement upsert (`onConflictDoUpdate`) rather
 * than a select-then-branch, so the write is atomic under concurrent access.
 */
export function setSystemConfigValue(
  key: SystemConfigKey,
  value: string,
): void {
  const db = getDatabase();
  const updatedAt = Math.floor(Date.now() / 1000);

  db.insert(systemConfig)
    .values({ key, value, updatedAt })
    .onConflictDoUpdate({
      target: systemConfig.key,
      set: { value, updatedAt },
    })
    .run();

  logger.debug("Set system config value", {
    key,
    valueLength: value.length,
  });
}
