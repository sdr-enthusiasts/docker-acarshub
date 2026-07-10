// ----------------------------------------------------------------------------
// GOD-03: extracted from db/queries/messages.ts.
//
// addMessage() — insert a new ACARS message with alert matching, frequency
// tracking, signal-level counting, and message-count bookkeeping. Equivalent
// to the Python add_message() function.
// ----------------------------------------------------------------------------

import { eq, sql } from "drizzle-orm";
import { DB_SAVEALL } from "../../../config.js";
import { createLogger } from "../../../utils/logger.js";
import { getDatabase } from "../../client.js";
import { isMessageNotEmpty, updateFrequencies } from "../../helpers.js";
import {
  alertMatches,
  alertStats,
  levelAcars,
  levelHfdl,
  levelImsl,
  levelIrdm,
  levelVdlm2,
  messages,
  messagesCount,
  messagesCountDropped,
  type NewMessage,
} from "../../schema.js";
import { getCachedAlertIgnoreTerms, getCachedAlertTerms } from "../alerts.js";
import { incrementMessageCounter } from "../statistics.js";

const logger = createLogger("db:messages-insert");

/**
 * Monotonically decreasing counter for unsaved messages (those skipped by
 * DB_SAVEALL / emptiness checks).  Negative values distinguish them from real
 * DB row IDs (always positive) and guarantee every emitted message carries a
 * unique `uid` — preventing duplicate React keys on the frontend.
 *
 * STATE-02: encapsulated in a small factory rather than a bare module-level
 * `let`, matching the pattern used for the other ambient-singleton counters
 * in this module tree (statistics.ts, alerts.ts).
 */
function createUnsavedMessageCounterState() {
  let counter = 0;
  return {
    decrementAndGet: (): number => {
      counter -= 1;
      return counter;
    },
    reset: (): void => {
      counter = 0;
    },
  };
}

const unsavedMessageCounterState = createUnsavedMessageCounterState();

/**
 * Reset the unsaved-message counter.  Exposed only for tests.
 */
export function resetUnsavedMessageCounter(): void {
  unsavedMessageCounterState.reset();
}

/**
 * Alert metadata returned by addMessage()
 */
export interface AlertMetadata {
  uid: string;
  matched: boolean;
  matched_text: string[];
  matched_icao: string[];
  matched_tail: string[];
  matched_flight: string[];
}

/**
 * Insert a new ACARS message into the database with full alert matching,
 * frequency tracking, signal level counting, and message count updates
 *
 * Equivalent to Python add_message() function.
 *
 * This function:
 * 1. Generates UID for message
 * 2. Updates frequency counts (updateFrequencies)
 * 3. Checks if message should be saved (DB_SAVEALL or isMessageNotEmpty)
 * 4. Updates message counts (messagesCount or messagesCountDropped)
 * 5. Updates signal level counts per decoder
 * 6. Performs alert matching (text, icao, tail, flight) with ignore terms
 * 7. Creates AlertMatch rows and updates alertStats
 * 8. Returns alert metadata for Socket.IO emission
 *
 * @param message Message data (without id)
 * @param messageFromJson Original JSON message for emptiness check
 * @returns Alert metadata with matched terms
 */
export function addMessage(
  message: Omit<NewMessage, "id">,
  messageFromJson?: Record<string, unknown>,
): AlertMetadata {
  const db = getDatabase();

  // Provisional uid – replaced by the real row id when the message is saved.
  // For unsaved messages (empty + DB_SAVEALL off) we mint a unique negative id
  // so every Socket.IO emission carries a distinct uid (avoids duplicate React keys).
  let uid = String(unsavedMessageCounterState.decrementAndGet());

  // Initialize alert match tracking
  const alertMetadata: AlertMetadata = {
    uid,
    matched: false,
    matched_text: [],
    matched_icao: [],
    matched_tail: [],
    matched_flight: [],
  };

  try {
    // Update frequency counts
    if (message.freq && message.messageType) {
      updateFrequencies(message.freq, message.messageType);
    }

    // Determine if message should be saved
    const shouldSave =
      DB_SAVEALL ||
      (messageFromJson ? isMessageNotEmpty(messageFromJson) : true);

    if (shouldSave) {
      // Insert the message
      const res = db.insert(messages)
        .values({
          ...message,
        })
        .returning({id: messages.id})
        .all();

      uid = String(res[0].id);
      // update alert metadata with actual uid
      alertMetadata.uid = uid;

      // Increment in-memory counter for system status
      incrementMessageCounter(message.messageType);
    }

    // Update message counts
    const isEmpty = messageFromJson
      ? !isMessageNotEmpty(messageFromJson)
      : false;
    const hasError = typeof message.error === "number" && message.error > 0;

    if (!isEmpty) {
      // Update messagesCount (for non-empty messages)
      const count = db.select().from(messagesCount).get();

      if (count) {
        db.update(messagesCount)
          .set({
            total: (count.total ?? 0) + 1,
            good: hasError ? (count.good ?? 0) : (count.good ?? 0) + 1,
            errors: hasError ? (count.errors ?? 0) + 1 : (count.errors ?? 0),
          })
          .run();
      } else {
        db.insert(messagesCount)
          .values({
            total: 1,
            good: hasError ? 0 : 1,
            errors: hasError ? 1 : 0,
          })
          .run();
      }
    } else {
      // Update messagesCountDropped (for empty messages)
      const count = db.select().from(messagesCountDropped).get();

      if (count) {
        db.update(messagesCountDropped)
          .set({
            nonloggedGood: hasError
              ? (count.nonloggedGood ?? 0)
              : (count.nonloggedGood ?? 0) + 1,
            nonloggedErrors: hasError
              ? (count.nonloggedErrors ?? 0) + 1
              : (count.nonloggedErrors ?? 0),
          })
          .run();
      } else {
        db.insert(messagesCountDropped)
          .values({
            nonloggedGood: hasError ? 0 : 1,
            nonloggedErrors: hasError ? 1 : 0,
          })
          .run();
      }
    }

    // Update signal level counts per decoder
    if (
      message.level !== null &&
      message.level !== undefined &&
      message.level !== ""
    ) {
      // Parse level from string to number (messages.level is text, level_*.level is real)
      const levelValue =
        typeof message.level === "string"
          ? Number.parseFloat(message.level)
          : message.level;

      // Skip if level is not a valid number
      if (Number.isNaN(levelValue)) {
        logger.warn("Invalid level value", { level: message.level });
      } else {
        const levelTableMap = {
          ACARS: levelAcars,
          "VDL-M2": levelVdlm2,
          VDLM2: levelVdlm2,
          HFDL: levelHfdl,
          IMSL: levelImsl,
          IRDM: levelIrdm,
        };

        const levelTable =
          levelTableMap[message.messageType as keyof typeof levelTableMap];

        if (levelTable) {
          const existing = db
            .select()
            .from(levelTable)
            .where(eq(levelTable.level, levelValue))
            .get();

          if (existing) {
            db.update(levelTable)
              .set({ count: sql`${levelTable.count} + 1` })
              .where(eq(levelTable.level, levelValue))
              .run();
          } else {
            db.insert(levelTable).values({ level: levelValue, count: 1 }).run();
          }
        }
      }
    }

    // Perform alert matching (use cached terms to avoid DB hits)
    const alertTerms = getCachedAlertTerms();
    const alertTermsIgnore = getCachedAlertIgnoreTerms();

    // don't try to add to alert matches if it is not added to the main table
    if (shouldSave && alertTerms.length > 0 && uid !== "-1") {
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
            messageId: Number(uid),
            term: term.toUpperCase(),
            matchType,
            matchedAt: message.time,
          })
          .run();

        // Update alert metadata
        alertMetadata.matched = true;
        if (matchType === "text") {
          alertMetadata.matched_text.push(term.toUpperCase());
        } else if (matchType === "icao") {
          alertMetadata.matched_icao.push(term.toUpperCase());
        } else if (matchType === "tail") {
          alertMetadata.matched_tail.push(term.toUpperCase());
        } else if (matchType === "flight") {
          alertMetadata.matched_flight.push(term.toUpperCase());
        }
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
          // Support both full match and partial substring match
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
          // Support both full match and partial substring match
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
          // Support both full match and partial substring match
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

    return alertMetadata;
  } catch (error) {
    logger.error("Failed to add message", {
      error: error instanceof Error ? error.message : String(error),
      uid,
    });
    return alertMetadata;
  }
}
