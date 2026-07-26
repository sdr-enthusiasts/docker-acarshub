// ----------------------------------------------------------------------------
// GOD-03: extracted from db/queries/messages.ts.
//
// Read-only range/lookup queries: most-recent N, full dump, row count + DB
// file size, single-message lookup by UID, and count-by-time-range.
// ----------------------------------------------------------------------------

import { statSync } from "node:fs";
import { and, desc, eq, sql } from "drizzle-orm";
import { createLogger } from "../../../utils/logger.js";
import { getDatabase, getSqliteConnection } from "../../client.js";
import { type Message, messages } from "../../schema.js";

const logger = createLogger("db:messages-range");

/**
 * Get the N most recent messages
 *
 * Equivalent to Python grab_most_recent() function.
 *
 * @param limit Number of messages to retrieve (default: 50)
 * @returns Array of recent messages, newest first
 */
export function grabMostRecent(limit = 50): Message[] {
  const db = getDatabase();

  return db
    .select()
    .from(messages)
    .orderBy(desc(messages.time))
    .limit(limit)
    .all();
}

/**
 * Get all messages (no pagination)
 *
 * Equivalent to Python show_all() function.
 *
 * ⚠️ WARNING: This can return a very large result set.
 * Use with caution on production databases.
 *
 * @returns Array of all messages
 */
export function showAll(): Message[] {
  const db = getDatabase();

  return db.select().from(messages).orderBy(desc(messages.time)).all();
}

/**
 * Get total message count and database file size
 *
 * Equivalent to Python database_get_row_count() function.
 *
 * @returns Tuple of [message count, database file size in bytes]
 */
export function getRowCount(): { count: number; size: number | null } {
  const db = getDatabase();

  const result = db
    .select({ count: sql<number>`count(*)` })
    .from(messages)
    .get();

  const count = result?.count ?? 0;

  // Get database file size
  // Use the actual connection path rather than the env var so that in-memory
  // databases (":memory:") used in tests never trigger a spurious ENOENT warn.
  let size: number | null = null;
  const dbPath = getSqliteConnection().name;
  if (dbPath !== ":memory:") {
    try {
      const stats = statSync(dbPath);
      size = stats.size;
    } catch (error) {
      logger.warn("Failed to get database file size", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { count, size };
}

/**
 * Get message by UID
 *
 * @param uid Message unique identifier
 * @returns Message or undefined if not found
 */
export function getMessageByUid(uid: string): Message | undefined {
  const db = getDatabase();

  return db.select().from(messages).where(eq(messages.id, Number(uid))).get();
}

/**
 * Get message count by time range
 *
 * Useful for analytics and metrics.
 *
 * @param startTime Start timestamp (inclusive)
 * @param endTime End timestamp (inclusive)
 * @returns Number of messages in time range
 */
export function getMessageCountByTimeRange(
  startTime: number,
  endTime: number,
): number {
  const db = getDatabase();

  const result = db
    .select({ count: sql<number>`count(*)` })
    .from(messages)
    .where(
      and(
        sql`${messages.time} >= ${startTime}`,
        sql`${messages.time} <= ${endTime}`,
      ),
    )
    .get();

  return result?.count ?? 0;
}
