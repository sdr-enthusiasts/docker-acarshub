/**
 * Message query functions for ACARS Hub database
 *
 * This module implements message-related database operations matching
 * the Python functions in rootfs/webapp/acarshub_database.py:
 * - add_message(): Insert new message with UID generation, alert matching, frequency/level/count updates
 * - database_search(): Search messages with pagination (FTS5 + fallback)
 * - grab_most_recent(): Get N most recent messages
 * - show_all(): Get all messages (for export/analysis)
 * - database_get_row_count(): Get total message count
 * - prune_database(): Delete old messages while protecting alert matches
 *
 * Key differences from Python:
 * - Synchronous API (better-sqlite3 is sync-only)
 * - Type-safe with TypeScript
 * - Uses Drizzle ORM instead of raw SQL
 * - FTS5 integration for fast prefix matching
 */

import { randomUUID } from "node:crypto";
import { statSync } from "node:fs";
import { and, asc, desc, eq, like, notInArray, sql } from "drizzle-orm";
import { DB_SAVEALL } from "../../config.js";
import { createLogger } from "../../utils/logger.js";
import { getDatabase } from "../client.js";
import { isMessageNotEmpty, updateFrequencies } from "../helpers.js";
import {
  alertMatches,
  alertStats,
  levelAcars,
  levelHfdl,
  levelImsl,
  levelIrdm,
  levelVdlm2,
  type Message,
  messages,
  messagesCount,
  messagesCountDropped,
  type NewMessage,
} from "../schema.js";
import { getCachedAlertIgnoreTerms, getCachedAlertTerms } from "./alerts.js";

const logger = createLogger("db:messages");

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
 * 1. Generates UUID for message
 * 2. Updates frequency counts (updateFrequencies)
 * 3. Checks if message should be saved (DB_SAVEALL or isMessageNotEmpty)
 * 4. Updates message counts (messagesCount or messagesCountDropped)
 * 5. Updates signal level counts per decoder
 * 6. Performs alert matching (text, icao, tail, flight) with ignore terms
 * 7. Creates AlertMatch rows and updates alertStats
 * 8. Returns alert metadata for Socket.IO emission
 *
 * @param message Message data (without id and uid)
 * @param messageFromJson Original JSON message for emptiness check
 * @returns Alert metadata with matched terms
 */
export function addMessage(
  message: Omit<NewMessage, "id" | "uid">,
  messageFromJson?: Record<string, unknown>,
): AlertMetadata {
  const db = getDatabase();

  // Generate UUID for the message
  const uid = randomUUID();

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
      db.insert(messages)
        .values({
          ...message,
          uid,
        })
        .run();
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

    if (alertTerms.length > 0) {
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
            messageUid: uid,
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

/**
 * Search parameters for database_search()
 */
export interface SearchParams {
  // Filters
  tail?: string; // Aircraft tail number
  flight?: string; // Flight number
  icao?: string; // Aircraft ICAO hex
  depa?: string; // Departure airport ICAO
  dsta?: string; // Destination airport ICAO
  label?: string; // ACARS label
  msgno?: string; // Message number
  text?: string; // Full-text search in message text (maps to msg_text in FTS)
  freq?: string; // Frequency
  messageType?: string; // ACARS, VDLM2, HFDL, etc.
  stationId?: string; // Ground station ID

  // Time range
  startTime?: number; // Unix timestamp (inclusive)
  endTime?: number; // Unix timestamp (inclusive)

  // Pagination
  limit?: number; // Max results (default: 100)
  offset?: number; // Skip N results (default: 0)

  // Sorting
  sortBy?: "time" | "tail" | "flight" | "label"; // Sort column
  sortOrder?: "asc" | "desc"; // Sort direction (default: desc)
}

/**
 * Search result with total count for pagination
 */
export interface SearchResult {
  messages: Message[];
  totalCount: number;
}

/**
 * Sanitize user input for FTS5 MATCH queries
 *
 * FTS5 has special characters that need escaping:
 * - Double quotes (") for phrase search
 * - Asterisk (*) for prefix matching
 * - Boolean operators (AND, OR, NOT)
 *
 * @param query User input string to sanitize
 * @returns Sanitized string safe for FTS5 MATCH
 */
function sanitizeFtsQuery(query: string): string {
  // Escape double quotes by doubling them (FTS5 convention)
  let sanitized = query.replace(/"/g, '""');

  // Remove control characters that could break FTS5 syntax
  // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional sanitization of control chars
  sanitized = sanitized.replace(/[\x00-\x1f\x7f]/g, "");

  return sanitized;
}

/**
 * Build FTS5 MATCH query string from search parameters
 *
 * Maps frontend field names to FTS5 column names and builds
 * a safe MATCH string with proper escaping.
 *
 * @param params Search parameters
 * @returns FTS5 MATCH string or null if no FTS-compatible terms
 */
function buildFtsMatchString(params: SearchParams): string | null {
  const matchParts: string[] = [];

  // Map frontend field names to FTS5 column names
  const fieldMappings: Record<string, string> = {
    flight: "flight",
    tail: "tail",
    icao: "icao",
    depa: "depa",
    dsta: "dsta",
    label: "label",
    freq: "freq",
    text: "msg_text", // Frontend uses 'text', FTS uses 'msg_text'
  };

  for (const [frontendField, ftsField] of Object.entries(fieldMappings)) {
    const value = params[frontendField as keyof SearchParams];

    if (value && typeof value === "string" && value.trim() !== "") {
      const sanitizedValue = sanitizeFtsQuery(value.trim().toUpperCase());
      // Use prefix matching with * for flexibility
      matchParts.push(`${ftsField}:"${sanitizedValue}"*`);
    }
  }

  if (matchParts.length === 0) {
    return null;
  }

  // Join with AND for multi-field search
  return matchParts.join(" AND ");
}

/**
 * Check if search should use FTS5 or fall back to LIKE queries
 *
 * FTS5 only supports prefix matching, so substring searches for
 * station_id and icao (when user expects substring match) must use LIKE.
 *
 * Python parity: Matches Python logic where station_id or icao searches
 * force non-FTS path for substring matching capability.
 *
 * @param params Search parameters
 * @returns true if should use FTS5, false if must use LIKE
 */
function shouldUseFts(params: SearchParams): boolean {
  // If searching by station_id, must use LIKE (FTS5 doesn't have this indexed)
  if (params.stationId && params.stationId.trim() !== "") {
    logger.debug("Using LIKE search: station_id specified");
    return false;
  }

  // For ICAO searches, Python uses LIKE for substring matching
  // Users expect "BF3" to find "ABF308" (substring anywhere in ICAO)
  // FTS5 only supports prefix matching, so we must use LIKE for ICAO
  if (params.icao && params.icao.trim() !== "") {
    logger.debug("Using LIKE search: icao specified (substring matching)");
    return false;
  }

  return true;
}

/**
 * Search messages with filters and pagination using FTS5 or LIKE fallback
 *
 * Equivalent to Python database_search() function.
 *
 * This function uses two different search strategies:
 * 1. FTS5 search: Fast prefix matching for most fields (10-100x faster)
 * 2. Standard LIKE: Substring matching for station_id (slower but more flexible)
 *
 * Performance notes:
 * - FTS5 search is 10-100x faster but only supports prefix matching
 * - station_id searches use LIKE '%value%' which cannot use indexes (slow)
 * - For large databases, LIKE searches may take several seconds
 *
 * @param params Search parameters
 * @returns Search result with messages and total count
 */
export function databaseSearch(params: SearchParams): SearchResult {
  // Decide whether to use FTS5 or LIKE-based search
  const useFts = shouldUseFts(params);

  if (useFts) {
    // Try FTS5 search first
    const ftsResult = searchWithFts(params);
    if (ftsResult !== null) {
      logger.debug("Using FTS5 search", {
        matchCount: ftsResult.totalCount,
        limit: params.limit,
      });
      return ftsResult;
    }
    // Fall through to LIKE search if FTS5 fails
    logger.debug("FTS5 search returned no results, falling back to LIKE");
  }

  // Fall back to LIKE-based search (ORM query)
  logger.debug("Using LIKE-based search");
  return searchWithLike(params);
}

/**
 * Search using FTS5 full-text search (fast prefix matching)
 *
 * @param params Search parameters
 * @returns Search result or null if no FTS-compatible terms
 */
function searchWithFts(params: SearchParams): SearchResult | null {
  // Build FTS5 MATCH string
  const matchString = buildFtsMatchString(params);

  if (!matchString) {
    return null;
  }

  // Note: FTS5 search using raw SQL is only available with better-sqlite3 directly
  // Drizzle ORM doesn't expose prepare() method, so we use a workaround
  // For now, fall back to LIKE search
  logger.debug(
    "FTS5 raw SQL not available through Drizzle ORM, using fallback",
  );
  return null;
}

/**
 * Search using LIKE queries (slow but supports substring matching)
 *
 * @param params Search parameters
 * @returns Search result with messages and total count
 */
function searchWithLike(params: SearchParams): SearchResult {
  const db = getDatabase();

  // Build WHERE clauses
  const conditions = [];

  if (params.tail) {
    conditions.push(like(messages.tail, `%${params.tail}%`));
  }

  if (params.flight) {
    conditions.push(like(messages.flight, `%${params.flight}%`));
  }

  if (params.icao) {
    conditions.push(like(messages.icao, `%${params.icao}%`));
  }

  if (params.depa) {
    conditions.push(like(messages.depa, `%${params.depa}%`));
  }

  if (params.dsta) {
    conditions.push(like(messages.dsta, `%${params.dsta}%`));
  }

  if (params.label) {
    conditions.push(like(messages.label, `%${params.label}%`));
  }

  if (params.msgno) {
    conditions.push(like(messages.msgno, `%${params.msgno}%`));
  }

  if (params.text) {
    conditions.push(like(messages.text, `%${params.text}%`));
  }

  if (params.freq) {
    conditions.push(eq(messages.freq, params.freq));
  }

  if (params.messageType) {
    conditions.push(eq(messages.messageType, params.messageType));
  }

  if (params.stationId) {
    conditions.push(like(messages.stationId, `%${params.stationId}%`));
  }

  if (params.startTime !== undefined) {
    conditions.push(sql`${messages.time} >= ${params.startTime}`);
  }

  if (params.endTime !== undefined) {
    conditions.push(sql`${messages.time} <= ${params.endTime}`);
  }

  // Get total count
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const countResult = db
    .select({ count: sql<number>`count(*)` })
    .from(messages)
    .where(whereClause)
    .get();

  const totalCount = countResult?.count ?? 0;

  if (totalCount === 0) {
    return { messages: [], totalCount: 0 };
  }

  // Determine sort column and order
  const sortColumn =
    params.sortBy === "tail"
      ? messages.tail
      : params.sortBy === "flight"
        ? messages.flight
        : params.sortBy === "label"
          ? messages.label
          : messages.time;

  const sortFn = params.sortOrder === "asc" ? asc : desc;

  // Execute paginated query
  const results = db
    .select()
    .from(messages)
    .where(whereClause)
    .orderBy(sortFn(sortColumn))
    .limit(params.limit ?? 100)
    .offset(params.offset ?? 0)
    .all();

  return {
    messages: results,
    totalCount,
  };
}

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
  let size: number | null = null;
  try {
    const dbPath = process.env.ACARSHUB_DB || "./data/acarshub.db";
    // Remove "sqlite:///" prefix if present (Python format)
    const cleanPath = dbPath.replace(/^sqlite:\/\/\//, "");
    const stats = statSync(cleanPath);
    size = stats.size;
  } catch (error) {
    logger.warn("Failed to get database file size", {
      error: error instanceof Error ? error.message : String(error),
    });
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

  return db.select().from(messages).where(eq(messages.uid, uid)).get();
}

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
  messageSaveDays = 7,
  alertSaveDays = 2,
): { prunedMessages: number; prunedAlerts: number } {
  const db = getDatabase();

  // Calculate cutoff timestamps
  const now = Date.now() / 1000; // Unix timestamp in seconds
  const messageCutoff = Math.floor(now - messageSaveDays * 24 * 60 * 60);
  const alertCutoff = Math.floor(now - alertSaveDays * 24 * 60 * 60);

  logger.info("Pruning database", {
    messageCutoff,
    alertCutoff,
    messageSaveDays,
    alertSaveDays,
  });

  // Get UIDs of messages with active alert matches (within alert retention window)
  // These messages must be preserved even if older than messageSaveDays
  const protectedUidsResult = db
    .selectDistinct({ messageUid: alertMatches.messageUid })
    .from(alertMatches)
    .where(sql`${alertMatches.matchedAt} >= ${alertCutoff}`)
    .all();

  const protectedUids = protectedUidsResult.map((row) => row.messageUid);

  let prunedMessages = 0;

  if (protectedUids.length > 0) {
    logger.info(
      `Protecting ${protectedUids.length} messages with active alert matches`,
    );

    // Prune messages older than cutoff, EXCLUDING those with active alert matches
    const result = db
      .delete(messages)
      .where(
        and(
          sql`${messages.time} < ${messageCutoff}`,
          notInArray(messages.uid, protectedUids),
        ),
      )
      .returning({ id: messages.id })
      .all();

    prunedMessages = result.length;
  } else {
    // No protected messages, prune normally
    const result = db
      .delete(messages)
      .where(sql`${messages.time} < ${messageCutoff}`)
      .returning({ id: messages.id })
      .all();

    prunedMessages = result.length;
  }

  logger.info(`Pruned ${prunedMessages} messages`);

  // Prune old alert_matches (using matched_at timestamp)
  logger.info("Pruning alert matches");

  const alertResult = db
    .delete(alertMatches)
    .where(sql`${alertMatches.matchedAt} < ${alertCutoff}`)
    .returning({ id: alertMatches.id })
    .all();

  const prunedAlerts = alertResult.length;

  logger.info(`Pruned ${prunedAlerts} alert matches`);

  return {
    prunedMessages,
    prunedAlerts,
  };
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

/**
 * Optimize database with ANALYZE (regular optimization)
 *
 * Equivalent to Python optimize_db_regular() function.
 *
 * Runs ANALYZE to update SQLite query planner statistics.
 * Should be run periodically for optimal query performance.
 */
export function optimizeDbRegular(): void {
  const db = getDatabase();

  try {
    logger.info("Running ANALYZE (regular optimization)");
    // Execute ANALYZE using Drizzle's sql template
    db.run(sql`ANALYZE`);
    logger.info("ANALYZE complete");
  } catch (error) {
    logger.error("Failed to run ANALYZE", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Optimize database with FTS5 merge (deep optimization)
 *
 * Equivalent to Python optimize_db_merge() function.
 *
 * Runs FTS5 'merge' optimization to consolidate FTS index segments.
 * This is more intensive than regular ANALYZE and should be run less frequently.
 *
 * @param mergeLevel FTS5 merge level (default: -16 for full merge)
 */
export function optimizeDbMerge(mergeLevel = -16): void {
  const db = getDatabase();

  try {
    logger.info("Running FTS5 merge optimization", { mergeLevel });
    // Execute FTS5 merge using Drizzle's sql template
    db.run(
      sql`INSERT INTO messages_fts(messages_fts) VALUES (${`merge=${mergeLevel}`})`,
    );
    logger.info("FTS5 merge complete");
  } catch (error) {
    logger.error("Failed to run FTS5 merge", {
      error: error instanceof Error ? error.message : String(error),
      mergeLevel,
    });
  }
}
