// ----------------------------------------------------------------------------
// GOD-03: extracted from db/queries/messages.ts.
//
// Single-purpose message deletion by timestamp cutoff. See prune.ts for the
// alert-match-aware retention-policy pruning used by the scheduler.
// ----------------------------------------------------------------------------

import { sql } from "drizzle-orm";
import { getDatabase } from "../../client.js";
import { messages } from "../../schema.js";

/**
 * Delete messages older than a specific timestamp
 *
 * Used for database pruning/cleanup.
 *
 * @param beforeTimestamp Unix timestamp (delete messages before this time)
 * @returns Number of messages deleted
 */
export function deleteOldMessages(beforeTimestamp: number): number {
  const db = getDatabase();

  const result = db
    .delete(messages)
    .where(sql`${messages.time} < ${beforeTimestamp}`)
    .returning({ id: messages.id })
    .all();

  return result.length;
}
