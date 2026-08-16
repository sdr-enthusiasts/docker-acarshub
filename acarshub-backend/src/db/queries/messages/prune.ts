// ----------------------------------------------------------------------------
// GOD-03: extracted from db/queries/messages.ts.
//
// pruneDatabase() — retention-policy pruning that protects messages with
// recent alert matches even if they're older than the message retention
// window. Equivalent to the Python prune_database() function.
// ----------------------------------------------------------------------------

import { and, eq, sql } from "drizzle-orm";
import { DB_ALERT_SAVE_DAYS, DB_SAVE_DAYS } from "../../../config.js";
import { createLogger } from "../../../utils/logger.js";
import { getDatabase } from "../../client.js";
import { aircraft, alertMatches, messages } from "../../schema.js";

const logger = createLogger("db:messages-prune");

/**
 * Prune old messages, alert matches, and (v4.3 Phase 6) orphaned flight
 * sessions from the database.
 *
 * Equivalent to Python prune_database() function.
 *
 * Important: Messages with active alert matches (within alertSaveDays) are preserved
 * even if they're older than messageSaveDays. This prevents orphaned alert_match rows.
 *
 * @param messageSaveDays Number of days to retain messages (default: 7)
 * @param alertSaveDays Number of days to retain alert matches (default: 2)
 * @returns Object with counts of pruned messages, alert matches, and sessions
 */
export function pruneDatabase(
  messageSaveDays = DB_SAVE_DAYS,
  alertSaveDays = DB_ALERT_SAVE_DAYS,
): { prunedMessages: number; prunedAlerts: number; prunedSessions: number } {
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

  // v4.3 Phase 6, decision D4: session pruning runs LAST, after both deletes
  // above, and only ever touches inactive (is_active = 0) sessions.
  //
  // Ordering matters for two reasons:
  //   (a) the messages delete above is what actually controls database
  //       size, so it must run — and be able to fail independently — before
  //       any session prune is attempted;
  //   (b) restricting to is_active = 0 closes the race where this function
  //       runs between a session being created (findOrCreateSession, in
  //       services/session-service.ts) and its first message being linked
  //       (background-services.ts's setupMessageQueue()): a brand-new
  //       *active* session with no messages yet is left alone here. It will
  //       be marked inactive by the expiry sweep (session-service.ts's
  //       expireStaleSessions(), on its own 5-minute schedule) and picked up
  //       by a later prune pass if it still has no messages then.
  //
  // The `NOT EXISTS` guard is not a convenience — it is what keeps this
  // DELETE from ever tripping the `NO ACTION` foreign key that
  // migration16.ts put on messages.session_id (see agent-docs/V4.3.md
  // "Session Identifier Type"): SQLite enforces NO ACTION by refusing a
  // parent-table DELETE if any child row still references it, so a session
  // with a surviving message would make this DELETE fail loudly rather than
  // corrupt anything — but the guard means that never happens in the first
  // place, and ix_messages_session_id (migration17.ts) is what keeps the
  // guard's child-table lookup cheap.
  //
  // `ON DELETE CASCADE` must NEVER be added to messages.session_id: it would
  // delete MESSAGES when a session is pruned, which is exactly backwards —
  // message pruning is supposed to control database size, and a session
  // existing only because of a distant memory of a hex/callsign match is not
  // a reason to destroy the messages that are the actual data of record.
  // `ON DELETE SET NULL` is also wrong, for a quieter but worse reason: it
  // would let a buggy prune silently discard linkage instead of failing, and
  // the symptom — a history endpoint returning an empty trail for a message
  // that genuinely had a session — looks like a data gap, not a bug, so it
  // would go uninvestigated.
  //
  // Retention story for `aircraft` (Architecture Invariant 10 requires every
  // new table to have one): a session survives exactly as long as at least
  // one of its messages does. There is no independent session retention
  // window — once every message referencing a session has aged out of
  // `messages` via the delete above, the session itself becomes eligible for
  // removal on the very next prune pass.
  const sessionResult = db
    .delete(aircraft)
    .where(
      and(
        eq(aircraft.isActive, 0),
        sql`NOT EXISTS (
          SELECT 1 FROM messages WHERE messages.session_id = aircraft.id
        )`,
      ),
    )
    .returning({ id: aircraft.id })
    .all();

  const prunedSessions = sessionResult.length;

  logger.debug(`Pruned ${prunedSessions} sessions`);

  return {
    prunedMessages,
    prunedAlerts,
    prunedSessions,
  };
}
