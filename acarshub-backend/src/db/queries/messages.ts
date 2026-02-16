/**
 * Message query functions for ACARS Hub database
 *
 * This module implements message-related database operations matching
 * the Python functions in rootfs/webapp/acarshub_database.py:
 * - add_message(): Insert new message with UID generation
 * - database_search(): Search messages with pagination
 * - grab_most_recent(): Get N most recent messages
 * - show_all(): Get all messages (for export/analysis)
 * - database_get_row_count(): Get total message count
 *
 * Key differences from Python:
 * - Synchronous API (better-sqlite3 is sync-only)
 * - Type-safe with TypeScript
 * - Uses Drizzle ORM instead of raw SQL
 */

import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, like, sql } from "drizzle-orm";
import { getDatabase } from "../client.js";
import { type Message, messages, type NewMessage } from "../schema.js";

/**
 * Insert a new ACARS message into the database
 *
 * Equivalent to Python add_message() function.
 *
 * @param message Message data (without id and uid)
 * @returns Inserted message with generated uid and id
 */
export function addMessage(message: Omit<NewMessage, "id" | "uid">): Message {
  const db = getDatabase();

  // Generate UUID for the message
  const uid = randomUUID();

  // Insert message with generated UID
  const inserted = db
    .insert(messages)
    .values({
      ...message,
      uid,
    })
    .returning()
    .get();

  return inserted;
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
  text?: string; // Full-text search in message text
  freq?: string; // Frequency
  messageType?: string; // ACARS, VDLM2, HFDL, etc.

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
 * Search messages with filters and pagination
 *
 * Equivalent to Python database_search() function.
 *
 * @param params Search parameters
 * @returns Array of matching messages
 */
export function databaseSearch(params: SearchParams): Message[] {
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

  if (params.startTime !== undefined) {
    conditions.push(sql`${messages.time} >= ${params.startTime}`);
  }

  if (params.endTime !== undefined) {
    conditions.push(sql`${messages.time} <= ${params.endTime}`);
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

  // Execute query
  const query = db
    .select()
    .from(messages)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(sortFn(sortColumn))
    .limit(params.limit ?? 100)
    .offset(params.offset ?? 0);

  return query.all();
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

  return db.select().from(messages).all();
}

/**
 * Get total message count
 *
 * Equivalent to Python database_get_row_count() function.
 *
 * @returns Total number of messages in database
 */
export function getRowCount(): number {
  const db = getDatabase();

  const result = db
    .select({ count: sql<number>`count(*)` })
    .from(messages)
    .get();

  return result?.count ?? 0;
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
