/**
 * Alert query functions for ACARS Hub database
 *
 * This module implements alert-related database operations matching
 * the Python functions in rootfs/webapp/acarshub_database.py:
 * - search_alerts(): Search alert matches with message JOIN
 * - load_recent_alerts(): Get recent alerts
 * - search_alerts_by_term(): Get alerts for specific term
 * - set_alert_terms(): Update alert term stats
 * - set_alert_ignore(): Update ignore terms
 * - reset_alert_counts(): Reset alert statistics
 * - get_alert_counts(): Get alert statistics
 *
 * Key differences from Python:
 * - Uses normalized alert_matches table (not denormalized messages_saved)
 * - JOIN messages table to get full message data
 * - Type-safe with TypeScript
 */

import { desc, eq, sql } from "drizzle-orm";
import { getDatabase } from "../client.js";
import {
  type AlertMatch,
  type AlertStat,
  alertMatches,
  alertStats,
  type IgnoreAlertTerm,
  ignoreAlertTerms,
  type Message,
  messages,
  type NewAlertMatch,
} from "../schema.js";

/**
 * Alert match with full message data
 *
 * Result of JOIN between alert_matches and messages tables.
 */
export interface AlertMatchWithMessage extends AlertMatch {
  message: Message;
}

/**
 * Add an alert match for a message
 *
 * @param match Alert match data (without id)
 * @returns Inserted alert match
 */
export function addAlertMatch(match: Omit<NewAlertMatch, "id">): AlertMatch {
  const db = getDatabase();

  const inserted = db.insert(alertMatches).values(match).returning().get();

  return inserted;
}

/**
 * Search alert matches with full message data
 *
 * Equivalent to Python search_alerts() function.
 *
 * @param limit Max results (default: 100)
 * @param offset Skip N results (default: 0)
 * @returns Array of alert matches with joined message data
 */
export function searchAlerts(limit = 100, offset = 0): AlertMatchWithMessage[] {
  const db = getDatabase();

  // JOIN alert_matches with messages to get full message data
  const results = db
    .select({
      // Alert match fields
      id: alertMatches.id,
      messageUid: alertMatches.messageUid,
      term: alertMatches.term,
      matchType: alertMatches.matchType,
      matchedAt: alertMatches.matchedAt,
      // Message fields
      message: messages,
    })
    .from(alertMatches)
    .innerJoin(messages, eq(alertMatches.messageUid, messages.uid))
    .orderBy(desc(alertMatches.matchedAt))
    .limit(limit)
    .offset(offset)
    .all();

  return results;
}

/**
 * Load recent alerts (last N)
 *
 * Equivalent to Python load_recent_alerts() function.
 *
 * @param limit Number of alerts to retrieve (default: 50)
 * @returns Array of recent alert matches with message data
 */
export function loadRecentAlerts(limit = 50): AlertMatchWithMessage[] {
  return searchAlerts(limit, 0);
}

/**
 * Search alerts by specific term
 *
 * Equivalent to Python search_alerts_by_term() function.
 *
 * @param term Alert term to filter by
 * @param limit Max results (default: 100)
 * @param offset Skip N results (default: 0)
 * @returns Array of alert matches for the term
 */
export function searchAlertsByTerm(
  term: string,
  limit = 100,
  offset = 0,
): AlertMatchWithMessage[] {
  const db = getDatabase();

  const results = db
    .select({
      id: alertMatches.id,
      messageUid: alertMatches.messageUid,
      term: alertMatches.term,
      matchType: alertMatches.matchType,
      matchedAt: alertMatches.matchedAt,
      message: messages,
    })
    .from(alertMatches)
    .innerJoin(messages, eq(alertMatches.messageUid, messages.uid))
    .where(eq(alertMatches.term, term))
    .orderBy(desc(alertMatches.matchedAt))
    .limit(limit)
    .offset(offset)
    .all();

  return results;
}

/**
 * Get alert statistics (term counts)
 *
 * Equivalent to Python get_alert_counts() function.
 *
 * @returns Array of alert statistics
 */
export function getAlertCounts(): AlertStat[] {
  const db = getDatabase();

  return db.select().from(alertStats).all();
}

/**
 * Get alert ignore terms
 *
 * Equivalent to Python get_alert_ignore() function.
 *
 * @returns Array of ignore terms
 */
export function getAlertIgnore(): IgnoreAlertTerm[] {
  const db = getDatabase();

  return db.select().from(ignoreAlertTerms).all();
}

/**
 * Set alert terms and update statistics
 *
 * Equivalent to Python set_alert_terms() function.
 *
 * This replaces all alert statistics with the provided terms.
 *
 * @param terms Array of alert terms
 */
export function setAlertTerms(terms: string[]): void {
  const db = getDatabase();

  // Delete all existing alert stats
  db.delete(alertStats).run();

  // Insert new alert stats (count starts at 0)
  if (terms.length > 0) {
    db.insert(alertStats)
      .values(terms.map((term) => ({ term, count: 0 })))
      .run();
  }
}

/**
 * Set alert ignore terms
 *
 * Equivalent to Python set_alert_ignore() function.
 *
 * This replaces all ignore terms with the provided list.
 *
 * @param terms Array of ignore terms
 */
export function setAlertIgnore(terms: string[]): void {
  const db = getDatabase();

  // Delete all existing ignore terms
  db.delete(ignoreAlertTerms).run();

  // Insert new ignore terms
  if (terms.length > 0) {
    db.insert(ignoreAlertTerms)
      .values(terms.map((term) => ({ term })))
      .run();
  }
}

/**
 * Reset alert statistics (set all counts to 0)
 *
 * Equivalent to Python reset_alert_counts() function.
 */
export function resetAlertCounts(): void {
  const db = getDatabase();

  // Update all alert stats to count = 0
  db.update(alertStats).set({ count: 0 }).run();
}

/**
 * Increment alert count for a specific term
 *
 * Called when a new alert match is created.
 *
 * @param term Alert term that matched
 */
export function incrementAlertCount(term: string): void {
  const db = getDatabase();

  // Find existing stat
  const stat = db
    .select()
    .from(alertStats)
    .where(eq(alertStats.term, term))
    .get();

  if (stat) {
    // Increment existing count
    db.update(alertStats)
      .set({ count: (stat.count ?? 0) + 1 })
      .where(eq(alertStats.term, term))
      .run();
  } else {
    // Create new stat with count = 1
    db.insert(alertStats).values({ term, count: 1 }).run();
  }
}

/**
 * Delete alert matches older than a specific timestamp
 *
 * Used for database pruning/cleanup.
 *
 * @param beforeTimestamp Unix timestamp (delete alerts before this time)
 * @returns Number of alert matches deleted
 */
export function deleteOldAlertMatches(beforeTimestamp: number): number {
  const db = getDatabase();

  const result = db
    .delete(alertMatches)
    .where(sql`${alertMatches.matchedAt} < ${beforeTimestamp}`)
    .returning({ id: alertMatches.id })
    .all();

  return result.length;
}

/**
 * Get alert matches for a specific message
 *
 * @param messageUid Message UID
 * @returns Array of alert matches for the message
 */
export function getAlertMatchesForMessage(messageUid: string): AlertMatch[] {
  const db = getDatabase();

  return db
    .select()
    .from(alertMatches)
    .where(eq(alertMatches.messageUid, messageUid))
    .all();
}
