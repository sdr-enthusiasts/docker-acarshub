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

/**
 * Regenerate all alert matches from scratch
 *
 * Equivalent to Python regenerate_all_alert_matches() function.
 *
 * This function:
 * 1. Deletes all existing alert matches
 * 2. Resets alert statistics to 0
 * 3. Scans all messages and re-applies alert matching logic
 * 4. Creates new AlertMatch rows for each match
 * 5. Updates alert statistics counts
 *
 * This is an expensive operation and should only be run when:
 * - Alert terms have been changed and historical matches need updating
 * - Database has been corrupted and needs rebuilding
 * - Migrating from old alert system
 *
 * @param alertTerms Array of alert terms to match
 * @param alertTermsIgnore Array of ignore terms
 * @returns Number of alert matches created
 */
export function regenerateAllAlertMatches(
  alertTerms: string[],
  alertTermsIgnore: string[],
): number {
  const db = getDatabase();
  let matchCount = 0;

  try {
    // Step 1: Delete all existing alert matches
    db.delete(alertMatches).run();

    // Step 2: Reset alert statistics
    resetAlertCounts();

    // Step 3: Process all messages
    const allMessages = db.select().from(messages).all();

    for (const message of allMessages) {
      // Helper function to save alert match
      const saveAlertMatch = (term: string, matchType: string): void => {
        // Update alert statistics
        const foundTerm = db
          .select()
          .from(alertStats)
          .where(eq(alertStats.term, term.toUpperCase()))
          .get();

        if (foundTerm) {
          db.update(alertStats)
            .set({ count: (foundTerm.count ?? 0) + 1 })
            .where(eq(alertStats.term, term.toUpperCase()))
            .run();
        } else {
          db.insert(alertStats)
            .values({ term: term.toUpperCase(), count: 1 })
            .run();
        }

        // Add to alert_matches table
        db.insert(alertMatches)
          .values({
            messageUid: message.uid,
            term: term.toUpperCase(),
            matchType,
            matchedAt: message.time,
          })
          .run();

        matchCount++;
      };

      // Check message text for alert terms (word boundary match)
      if (message.text && message.text.length > 0) {
        for (const searchTerm of alertTerms) {
          const regex = new RegExp(`\\b${searchTerm}\\b`, "i");
          if (regex.test(message.text)) {
            let shouldAdd = true;

            // Check ignore terms
            for (const ignoreTerm of alertTermsIgnore) {
              const ignoreRegex = new RegExp(`\\b${ignoreTerm}\\b`, "i");
              if (ignoreRegex.test(message.text)) {
                shouldAdd = false;
                break;
              }
            }

            if (shouldAdd) {
              saveAlertMatch(searchTerm, "text");
            }
          }
        }
      }

      // Check ICAO hex for alert terms (substring match)
      if (message.icao && message.icao.length > 0) {
        const icaoUpper = message.icao.toUpperCase();
        for (const searchTerm of alertTerms) {
          const termUpper = searchTerm.toUpperCase();
          if (icaoUpper === termUpper || icaoUpper.includes(termUpper)) {
            let shouldAdd = true;

            // Check ignore terms for ICAO
            for (const ignoreTerm of alertTermsIgnore) {
              const ignoreUpper = ignoreTerm.toUpperCase();
              if (
                icaoUpper === ignoreUpper ||
                icaoUpper.includes(ignoreUpper)
              ) {
                shouldAdd = false;
                break;
              }
            }

            if (shouldAdd) {
              saveAlertMatch(searchTerm, "icao");
            }
          }
        }
      }

      // Check tail number for alert terms (substring match)
      if (message.tail && message.tail.length > 0) {
        const tailUpper = message.tail.toUpperCase();
        for (const searchTerm of alertTerms) {
          const termUpper = searchTerm.toUpperCase();
          if (tailUpper === termUpper || tailUpper.includes(termUpper)) {
            let shouldAdd = true;

            // Check ignore terms for tail
            for (const ignoreTerm of alertTermsIgnore) {
              const ignoreUpper = ignoreTerm.toUpperCase();
              if (
                tailUpper === ignoreUpper ||
                tailUpper.includes(ignoreUpper)
              ) {
                shouldAdd = false;
                break;
              }
            }

            if (shouldAdd) {
              saveAlertMatch(searchTerm, "tail");
            }
          }
        }
      }

      // Check flight number for alert terms (substring match)
      if (message.flight && message.flight.length > 0) {
        const flightUpper = message.flight.toUpperCase();
        for (const searchTerm of alertTerms) {
          const termUpper = searchTerm.toUpperCase();
          if (flightUpper === termUpper || flightUpper.includes(termUpper)) {
            let shouldAdd = true;

            // Check ignore terms for flight
            for (const ignoreTerm of alertTermsIgnore) {
              const ignoreUpper = ignoreTerm.toUpperCase();
              if (
                flightUpper === ignoreUpper ||
                flightUpper.includes(ignoreUpper)
              ) {
                shouldAdd = false;
                break;
              }
            }

            if (shouldAdd) {
              saveAlertMatch(searchTerm, "flight");
            }
          }
        }
      }
    }

    return matchCount;
  } catch (error) {
    console.error("Failed to regenerate alert matches:", error);
    return matchCount;
  }
}
