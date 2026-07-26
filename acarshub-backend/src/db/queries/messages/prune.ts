// ----------------------------------------------------------------------------
// GOD-03: extracted from db/queries/messages.ts.
//
// pruneDatabase() — retention-policy pruning that protects messages with
// recent alert matches even if they're older than the message retention
// window. Equivalent to the Python prune_database() function.
// ----------------------------------------------------------------------------

import { and, sql } from "drizzle-orm";
import { DB_ALERT_SAVE_DAYS, DB_SAVE_DAYS } from "../../../config.js";
import { createLogger } from "../../../utils/logger.js";
import { getDatabase } from "../../client.js";
import { alertMatches, messages } from "../../schema.js";

const logger = createLogger("db:messages-prune");

/**
 * Prune old messages and alert matches from the database
 *
 * Equivalent to Python prune_database() function.
 *
 * Important: Messages with active alert matches (within alertSaveDays) are preserved
 * even if they're older than messageSaveDays. This prevents orphaned alert_match rows.
 *
 * @param messageSaveDays Number of days to retain messages (default: 7)
 * @param alertSaveDays Number of days to retain alert matches (default: 2)
 * @returns Object with counts of pruned messages and alert matches
 */
export function pruneDatabase(
  messageSaveDays = DB_SAVE_DAYS,
  alertSaveDays = DB_ALERT_SAVE_DAYS,
): { prunedMessages: number; prunedAlerts: number } {
  const db = getDatabase();

  // Calculate cutoff timestamps
  const now = Date.now() / 1000; // Unix timestamp in seconds
  const messageCutoff = Math.floor(now - messageSaveDays * 24 * 60 * 60);
  const alertCutoff = Math.floor(now - alertSaveDays * 24 * 60 * 60);

  logger.debug("Pruning database", {
    messageCutoff,
    alertCutoff,
    messageSaveDays,
    alertSaveDays,
  });

  // Delete messages older than messageCutoff, excluding any whose UID appears
  // in alert_matches within the alert retention window.
  //
  // Using a correlated subquery instead of the previous two-step approach
  // (SELECT all protected UIDs → notInArray) because:
  //
  //   1. SQLite's SQLITE_MAX_VARIABLE_NUMBER limits how many bind parameters a
  //      single statement can carry (default 999, max 32766).  With long alert
  //      retention windows and active alert terms there can be tens of thousands
  //      of protected UIDs, blowing past that limit and causing SQLITE_ERROR.
  //
  //   2. Loading all protected UIDs into a JS array and re-binding them as SQL
  //      parameters consumes significant memory for large datasets.
  //
  // The subquery lets SQLite resolve the protected set entirely in-engine with
  // no parameter count ceiling and no intermediate JS allocation.
  const result = db
    .delete(messages)
    .where(
      and(
        sql`${messages.time} < ${messageCutoff}`,
        sql`${messages.id} NOT IN (
          SELECT message_id FROM alert_matches
          WHERE matched_at >= ${alertCutoff}
        )`,
      ),
    )
    .returning({ id: messages.id })
    .all();

  const prunedMessages = result.length;

  logger.debug(`Pruned ${prunedMessages} messages`);

  // Prune old alert_matches (using matched_at timestamp)
  logger.debug("Pruning alert matches");

  const alertResult = db
    .delete(alertMatches)
    .where(sql`${alertMatches.matchedAt} < ${alertCutoff}`)
    .returning({ id: alertMatches.id })
    .all();

  const prunedAlerts = alertResult.length;

  logger.debug(`Pruned ${prunedAlerts} alert matches`);

  return {
    prunedMessages,
    prunedAlerts,
  };
}
